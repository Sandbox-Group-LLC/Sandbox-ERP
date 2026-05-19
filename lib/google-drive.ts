import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { refreshOrgAccessToken } from '@/lib/google-oauth';

let connectionSettings: any;

export async function getOrgAccessToken(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      googleRefreshToken: true,
      googleAccessToken: true,
      googleTokenExpiry: true,
    },
  });

  if (!org?.googleRefreshToken) {
    throw new Error('Google Workspace not connected for this organization. An admin needs to connect it in Settings.');
  }

  if (org.googleAccessToken && org.googleTokenExpiry && org.googleTokenExpiry.getTime() > Date.now() + 60000) {
    return org.googleAccessToken;
  }

  const credentials = await refreshOrgAccessToken(org.googleRefreshToken);

  if (!credentials.access_token) {
    throw new Error('Failed to refresh Google access token for organization');
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      googleAccessToken: credentials.access_token,
      googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    },
  });

  return credentials.access_token;
}

async function getConnectorAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Drive not connected');
  }
  return accessToken;
}

async function getAccessToken(organizationId?: string): Promise<string> {
  if (organizationId) {
    try {
      return await getOrgAccessToken(organizationId);
    } catch {
    }
  }
  return getConnectorAccessToken();
}

export async function getGoogleDriveClient(organizationId?: string) {
  const accessToken = await getAccessToken(organizationId);

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function getGoogleDocsClient(organizationId?: string) {
  const accessToken = await getAccessToken(organizationId);

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.docs({ version: 'v1', auth: oauth2Client });
}

export async function exportDocumentAsPdf(fileId: string, organizationId?: string): Promise<Buffer> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const result = await drive.files.export(
    { fileId, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(result.data as ArrayBuffer);
}

export async function createGoogleDoc(title: string, folderId?: string, organizationId?: string): Promise<{ id: string; url: string }> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const fileMetadata: any = {
    name: title,
    mimeType: 'application/vnd.google-apps.document',
  };
  
  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  const file = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, webViewLink',
  });

  return {
    id: file.data.id!,
    url: file.data.webViewLink!,
  };
}

export async function getDocumentUrl(fileId: string, organizationId?: string): Promise<string> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const file = await drive.files.get({
    fileId,
    fields: 'webViewLink',
  });

  return file.data.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`;
}

export function buildGoogleDocUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}

export function buildGoogleDocSuggestModeUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit?mode=suggesting`;
}

export async function copyGoogleDoc(sourceDocId: string, newTitle: string, organizationId?: string): Promise<{ id: string; url: string }> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const file = await drive.files.copy({
    fileId: sourceDocId,
    requestBody: {
      name: newTitle,
    },
    fields: 'id, webViewLink',
  });

  return {
    id: file.data.id!,
    url: file.data.webViewLink!,
  };
}

export async function getDocumentText(docId: string, organizationId?: string): Promise<string> {
  const docs = await getGoogleDocsClient(organizationId);
  
  const doc = await docs.documents.get({ documentId: docId });
  
  let text = '';
  const content = doc.data.body?.content || [];
  
  for (const element of content) {
    if (element.paragraph) {
      for (const paragraphElement of element.paragraph.elements || []) {
        if (paragraphElement.textRun?.content) {
          text += paragraphElement.textRun.content;
        }
      }
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellContent of cell.content || []) {
            if (cellContent.paragraph) {
              for (const paragraphElement of cellContent.paragraph.elements || []) {
                if (paragraphElement.textRun?.content) {
                  text += paragraphElement.textRun.content + '\t';
                }
              }
            }
          }
        }
        text += '\n';
      }
    }
  }
  
  return text.trim();
}

export async function exportDocAsPlainText(fileId: string, organizationId?: string): Promise<string> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const response = await drive.files.export({
    fileId,
    mimeType: 'text/plain'
  });
  
  return response.data as string;
}

export async function getFileMetadata(fileId: string, organizationId?: string): Promise<{ name: string; parents?: string[]; mimeType?: string }> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const file = await drive.files.get({
    fileId,
    fields: 'name, parents, mimeType',
  });
  
  return {
    name: file.data.name || '',
    parents: file.data.parents || undefined,
    mimeType: file.data.mimeType || undefined,
  };
}

export async function findSignedPdfInFolder(
  folderId: string, 
  originalDocName: string,
  organizationId?: string
): Promise<{ id: string; name: string; webViewLink: string } | null> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const baseName = originalDocName.replace(/\.[^/.]+$/, '').trim();
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
    fields: 'files(id, name, webViewLink, createdTime)',
    orderBy: 'createdTime desc',
  });
  
  const files = response.data.files || [];
  
  for (const file of files) {
    if (!file.name) continue;
    
    const pdfBaseName = file.name.replace(/\.pdf$/i, '').trim();
    
    if (pdfBaseName.toLowerCase() === baseName.toLowerCase()) {
      return {
        id: file.id!,
        name: file.name,
        webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      };
    }
    
    if (pdfBaseName.toLowerCase().startsWith(baseName.toLowerCase() + ' - ')) {
      const suffix = pdfBaseName.slice(baseName.length + 3);
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(suffix)) {
        return {
          id: file.id!,
          name: file.name,
          webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        };
      }
    }
    
    const signedVariants = [
      `${baseName} - signed`,
      `${baseName} (signed)`,
      `${baseName}_signed`,
      `${baseName}-signed`,
      `signed ${baseName}`,
      `signed_${baseName}`,
    ];
    
    for (const variant of signedVariants) {
      if (pdfBaseName.toLowerCase() === variant.toLowerCase()) {
        return {
          id: file.id!,
          name: file.name,
          webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        };
      }
    }
  }
  
  return null;
}

export async function getGoogleSheetsClient(organizationId?: string) {
  const accessToken = await getAccessToken(organizationId);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function createGoogleSheet(title: string, folderId?: string, organizationId?: string): Promise<{ id: string; url: string }> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const fileMetadata: any = {
    name: title,
    mimeType: 'application/vnd.google-apps.spreadsheet',
  };
  
  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  const file = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, webViewLink',
  });

  return {
    id: file.data.id!,
    url: file.data.webViewLink!,
  };
}

export async function updateSheetData(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  rows: string[][],
  organizationId?: string
): Promise<void> {
  const sheets = await getGoogleSheetsClient(organizationId);
  
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });
  } catch (e) {
  }
  
  const values = [headers, ...rows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
  
  const sheetsInfo = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const matchedSheet = sheetsInfo.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );
  const sheetId = matchedSheet?.properties?.sheetId ?? sheetsInfo.data.sheets?.[0]?.properties?.sheetId ?? 0;
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
          },
        },
      ],
    },
  });
}

export async function downloadFileContent(fileId: string, organizationId?: string): Promise<Buffer> {
  const drive = await getGoogleDriveClient(organizationId);
  
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  
  return Buffer.from(response.data as ArrayBuffer);
}
