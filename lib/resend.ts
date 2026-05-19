import { Resend } from 'resend';

let connectionSettings: any;

async function getReplitCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!hostname || !xReplitToken) {
    return null;
  }

  try {
    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    if (!connectionSettings || (!connectionSettings.settings.api_key)) {
      return null;
    }
    return {
      apiKey: connectionSettings.settings.api_key,
      fromEmail: connectionSettings.settings.from_email
    };
  } catch (error) {
    console.error('Failed to fetch Replit Resend credentials:', error);
    return null;
  }
}

function getStandardCredentials() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@resend.dev';
  
  if (!apiKey) {
    return null;
  }
  
  return { apiKey, fromEmail };
}

export async function getResendClient(): Promise<{ client: Resend; fromEmail: string } | null> {
  // Try Replit integration first
  const replitCreds = await getReplitCredentials();
  if (replitCreds) {
    return {
      client: new Resend(replitCreds.apiKey),
      fromEmail: replitCreds.fromEmail || 'noreply@resend.dev'
    };
  }

  // Fall back to standard environment variables
  const standardCreds = getStandardCredentials();
  if (standardCreds) {
    return {
      client: new Resend(standardCreds.apiKey),
      fromEmail: standardCreds.fromEmail
    };
  }

  // No credentials available
  console.warn('No Resend credentials available - emails will not be sent');
  return null;
}

export function getPortalBaseUrl(): string {
  // Production URL takes priority
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  // Replit dev domain
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  // Fallback
  return 'http://localhost:5000';
}

export async function sendInviteEmail(
  inviteeEmail: string,
  inviterName: string,
  organizationName: string,
  token: string,
  role: string
): Promise<boolean> {
  const resend = await getResendClient();
  if (!resend) {
    console.log('Resend not configured - skipping invite email');
    return false;
  }

  const baseUrl = getPortalBaseUrl();
  const loginUrl = `${baseUrl}/login?invite=${token}`;

  try {
    await resend.client.emails.send({
      from: resend.fromEmail,
      to: inviteeEmail,
      subject: `You've been invited to join ${organizationName} on Sandbox ERP`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">You're Invited!</h2>
          <p style="color: #4a4a4a; font-size: 16px;">
            <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on Sandbox ERP as a <strong>${role}</strong>.
          </p>
          <p style="color: #4a4a4a; font-size: 16px;">
            Click the button below to accept the invitation and create your account.
          </p>
          <a href="${loginUrl}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 10px;">
            Accept Invitation
          </a>
          <p style="color: #888; font-size: 14px; margin-top: 30px;">
            This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </p>
          <p style="color: #888; font-size: 14px;">
            This is an automated notification from Sandbox ERP.
          </p>
        </div>
      `,
    });
    console.log(`Invite email sent to ${inviteeEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send invite email:', error);
    return false;
  }
}

export type ExpenseReportAction = 'submitted' | 'approved' | 'returned' | 'resubmitted';

export async function sendExpenseReportNotification(params: {
  action: ExpenseReportAction;
  recipientEmails: string[];
  reportAmount: number;
  reportDate: Date;
  projectName: string;
  projectId: string;
  submitterName: string;
  comment?: string;
}): Promise<boolean> {
  if (!params.recipientEmails || params.recipientEmails.length === 0) {
    console.log('No recipient emails - skipping expense report notification');
    return false;
  }

  const resend = await getResendClient();
  if (!resend) {
    console.log('Resend not configured - skipping expense report notification email');
    return false;
  }

  const baseUrl = getPortalBaseUrl();
  const projectUrl = `${baseUrl}/projects/${params.projectId}`;
  const formattedAmount = `$${params.reportAmount.toFixed(2)}`;
  const formattedDate = new Date(params.reportDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let subject: string;
  let heading: string;
  let message: string;
  let buttonText = 'View Expense Reports';

  switch (params.action) {
    case 'submitted':
      subject = `New Expense Report: ${params.submitterName} - ${params.projectName} - ${formattedAmount}`;
      heading = 'New Expense Report Submitted';
      message = `<strong>${params.submitterName}</strong> has submitted an expense report for <strong>${params.projectName}</strong> totaling <strong>${formattedAmount}</strong>, awaiting your review.`;
      buttonText = 'Review Report';
      break;
    case 'approved':
      subject = `Expense Report Approved: ${params.projectName} - ${formattedAmount}`;
      heading = 'Expense Report Approved';
      message = `Your expense report for <strong>${params.projectName}</strong> totaling <strong>${formattedAmount}</strong> has been approved.`;
      break;
    case 'returned':
      subject = `Expense Report Returned: ${params.projectName} - ${formattedAmount}`;
      heading = 'Expense Report Returned for Revision';
      message = `Your expense report for <strong>${params.projectName}</strong> totaling <strong>${formattedAmount}</strong> has been returned for revision.`;
      break;
    case 'resubmitted':
      subject = `Expense Report Resubmitted: ${params.submitterName} - ${params.projectName} - ${formattedAmount}`;
      heading = 'Expense Report Resubmitted';
      message = `<strong>${params.submitterName}</strong> has resubmitted an expense report for <strong>${params.projectName}</strong> totaling <strong>${formattedAmount}</strong>, awaiting your review.`;
      buttonText = 'Review Report';
      break;
  }

  const commentHtml = params.action === 'returned' && params.comment
    ? `
          <div style="background: #fff3e0; border-left: 4px solid #f97316; border-radius: 4px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 4px 0; color: #1a1a1a; font-weight: 600;">Reason for Return:</p>
            <p style="margin: 0; color: #4a4a4a;">${params.comment}</p>
          </div>`
    : '';

  try {
    await resend.client.emails.send({
      from: resend.fromEmail,
      to: params.recipientEmails,
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">${heading}</h2>
          <p style="color: #4a4a4a; font-size: 16px;">
            ${message}
          </p>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; color: #1a1a1a;"><strong>Amount:</strong> ${formattedAmount}</p>
            <p style="margin: 8px 0 0 0; color: #1a1a1a;"><strong>Date:</strong> ${formattedDate}</p>
            <p style="margin: 8px 0 0 0; color: #1a1a1a;"><strong>Project:</strong> ${params.projectName}</p>
          </div>${commentHtml}
          <a href="${projectUrl}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 10px;">
            ${buttonText}
          </a>
          <p style="color: #888; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Sandbox ERP.
          </p>
        </div>
      `,
    });
    console.log(`Expense report ${params.action} notification sent to ${params.recipientEmails.length} recipient(s)`);
    return true;
  } catch (error) {
    console.error(`Failed to send expense report ${params.action} notification:`, error);
    return false;
  }
}

export async function sendAccessRequestEmail(
  newUser: { name: string; email: string; organizationId: string },
  organization: { name: string }
): Promise<boolean> {
  const resend = await getResendClient();
  if (!resend) {
    console.log('Resend not configured - skipping admin notification email');
    return false;
  }

  // Import prisma here to avoid circular dependencies
  const { prisma } = await import('./prisma');
  
  // Get all admin users in the SAME organization
  const admins = await prisma.user.findMany({
    where: {
      role: 'ADMIN',
      approvalStatus: 'APPROVED',
      organizationId: newUser.organizationId,
    },
    select: { email: true, name: true }
  });

  if (admins.length === 0 || !admins.some(a => a.email)) {
    console.log('No admin emails found - skipping notification');
    return false;
  }

  const adminEmails = admins.filter(a => a.email).map(a => a.email as string);
  const baseUrl = getPortalBaseUrl();
  const settingsUrl = `${baseUrl}/settings`;

  try {
    await resend.client.emails.send({
      from: resend.fromEmail,
      to: adminEmails,
      subject: `New Access Request: ${newUser.name || newUser.email}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">New Access Request</h2>
          <p style="color: #4a4a4a; font-size: 16px;">
            Someone is requesting access to <strong>${organization.name}</strong> on Sandbox ERP.
          </p>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; color: #1a1a1a;"><strong>Name:</strong> ${newUser.name || 'Not provided'}</p>
            <p style="margin: 8px 0 0 0; color: #1a1a1a;"><strong>Email:</strong> ${newUser.email || 'Not provided'}</p>
          </div>
          <p style="color: #4a4a4a; font-size: 16px;">
            To approve or deny this request, go to Settings → User Management.
          </p>
          <a href="${settingsUrl}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 10px;">
            Review Request
          </a>
          <p style="color: #888; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Sandbox ERP.
          </p>
        </div>
      `,
    });
    console.log(`Access request notification sent to ${adminEmails.length} admin(s)`);
    return true;
  } catch (error) {
    console.error('Failed to send access request email:', error);
    return false;
  }
}
