# Client Proof Approval Portal - Build Prompt

## Overview

Build a Graphic Proof Approval System with a **reversed workflow** where the internal agency team creates proof requests with uploaded assets, then sends magic links to external clients who review and approve/request changes.

## Workflow Comparison

| Step | Original System | Your System (Reversed) |
|------|-----------------|------------------------|
| 1 | Internal team creates request | Agency creates proof with uploaded asset |
| 2 | Sends magic link to designer | Sends magic link to client |
| 3 | Designer uploads proof | Client reviews the proof |
| 4 | Internal team approves | Client approves/requests changes |
| 5 | Share to print vendor | Agency receives approval, sends to production |

---

## Data Model

### proofRequests table

```
id: uuid primary key
organizationId: foreign key (required)
eventId: foreign key (optional)
clientEmail: varchar(255) - email of the client to review
clientName: varchar(255) - name of the client
clientToken: varchar(64) - magic link token for client portal access
title: varchar(255) required
description: text
printVendor: varchar(255)
area: varchar(255) - e.g., "Main Stage", "Registration Desk"
category: varchar(100) - e.g., "Signage", "Banner", "Poster"
dimensions: varchar(100) - e.g., "24x36 inches"
material: varchar(255) - e.g., "Vinyl", "Paper"
quantity: integer
dueDate: timestamp
priority: varchar(20) - low, normal, high, urgent
status: varchar(30) - default "pending_review"
  Options: pending_review, approved, revision_requested, rejected
createdBy: foreign key to users (the agency team member who created it)
approvedAt: timestamp
approvedBy: varchar (client identifier)
createdAt: timestamp
updatedAt: timestamp
```

### proofAssets table

```
id: uuid primary key
organizationId: foreign key
proofRequestId: foreign key
version: integer (auto-increment per proof)
fileName: varchar(255)
fileUrl: text (public URL from object storage)
fileSize: integer
mimeType: varchar(100)
uploadedBy: varchar (user id or client identifier)
uploaderType: varchar(20) - "internal" or "client"
notes: text
isCurrentVersion: boolean default true
createdAt: timestamp
```

### proofComments table

```
id: uuid primary key
organizationId: foreign key
proofRequestId: foreign key
proofAssetId: foreign key (optional, for version-specific comments)
authorId: varchar
authorType: varchar(20) - "internal" or "client"
authorName: varchar(255)
content: text
isInternal: boolean default false (internal-only comments hidden from clients)
createdAt: timestamp
```

---

## Key Pages to Build

### 1. Agency Side (Internal Admin)

#### Proof Management Dashboard (`/proof-management`)
- Table listing all proofs with filters: status, event, vendor, area
- Status badges: Pending Review (blue), Approved (green), Revision Requested (orange), Rejected (red)
- Priority badges
- Click to view detail

#### Create/Edit Proof Request Dialog
- Title, description, category
- Print vendor, area, material, dimensions, quantity
- Due date, priority
- Client email and name
- Upload initial proof asset (required)
- On create: generates a 64-character token for client access

#### Proof Detail Page (`/proof-requests/:id`)
- View proof details and current asset
- Version history with download links
- Upload new versions
- Comments section (can toggle internal-only)
- Status history/audit trail
- Button: "Send to Client" → sends email with magic link
- Button: "Copy Client Link" → copies portal URL

### 2. Client Portal (External)

#### Client Portal Entry (`/client/:token`)
- Validates token from URL
- Stores token in localStorage (`clientSessionToken`)
- Shows list of proof requests assigned to this client

#### Client Proof Detail (`/client/proof/:id`)
- Auth: Check `clientSessionToken` in localStorage
- Read-only proof details (title, description, specs)
- View current proof asset (image/PDF viewer)
- Version history with download
- Comments section (sees external comments, can add comments)
- **Action buttons:**
  - "Approve" → sets status to `approved`, records approvedAt + approvedBy
  - "Request Revision" → sets status to `revision_requested`, requires comment
  - "Reject" → sets status to `rejected`, requires comment

---

## API Endpoints

### Admin endpoints (require auth)

```
GET    /api/proof-requests              - List all for organization
POST   /api/proof-requests              - Create new (auto-generates clientToken)
GET    /api/proof-requests/:id          - Get details
PATCH  /api/proof-requests/:id          - Update
DELETE /api/proof-requests/:id          - Delete

GET    /api/proof-requests/:id/assets   - List assets
POST   /api/proof-requests/:id/assets   - Upload new version

GET    /api/proof-requests/:id/comments - List comments
POST   /api/proof-requests/:id/comments - Add comment

POST   /api/proof-requests/:id/send     - Send email to client with magic link
```

### Client portal endpoints (token auth via Authorization header)

```
POST   /api/client/auth                         - Validate token, return client info
GET    /api/client/proof-requests               - List proofs for this client token
GET    /api/client/proof-requests/:id           - Get proof details
GET    /api/client/proof-requests/:id/assets    - List assets
GET    /api/client/proof-requests/:id/comments  - List non-internal comments
POST   /api/client/proof-requests/:id/comments  - Add comment

POST   /api/client/proof-requests/:id/approve   - Approve the proof
POST   /api/client/proof-requests/:id/revision  - Request revision (requires comment)
POST   /api/client/proof-requests/:id/reject    - Reject (requires comment)
```

---

## File Upload Flow (using presigned URLs)

1. Agency uploads asset:
   ```
   POST /api/proof-assets/upload → returns { uploadUrl }
   PUT  to uploadUrl with file body
   POST /api/proof-requests/:id/assets with { fileName, mimeType, uploadUrl }
        → returns { publicUrl }
   ```

2. Store `publicUrl` in proofAssets table

---

## Magic Link Authentication

1. When creating a proof request, generate a 64-character token:
   ```javascript
   import crypto from 'crypto';
   const clientToken = crypto.randomBytes(32).toString('hex');
   ```

2. Client portal URL format: `/client/{clientToken}`

3. On client portal load:
   - Extract token from URL
   - Call `POST /api/client/auth` with token in body
   - On success: store token in `localStorage.setItem("clientSessionToken", token)`
   - All subsequent API calls include: `Authorization: Bearer ${token}`

4. Backend validates token:
   ```javascript
   app.use('/api/client/*', async (req, res, next) => {
     const token = req.headers.authorization?.replace('Bearer ', '');
     const proof = await db.query.proofRequests.findFirst({
       where: eq(proofRequests.clientToken, token)
     });
     if (!proof) return res.status(401).json({ message: 'Invalid token' });
     req.clientProof = proof;
     next();
   });
   ```

---

## Status Flow

```
Agency creates proof → pending_review
                           ↓
         ┌─────────────────┼─────────────────┐
         ↓                 ↓                 ↓
     approved      revision_requested     rejected
         ↓                 ↓
    (complete)     Agency uploads new version
                           ↓
                   pending_review (again)
```

---

## UI Implementation Notes

### 1. Status Badges
- `pending_review`: Blue with FileImage icon
- `approved`: Green with checkmark
- `revision_requested`: Orange/amber
- `rejected`: Red/destructive

### 2. Client Portal Design
- Clean, simple interface (clients aren't logged-in users)
- Prominent proof preview (image or PDF)
- Clear action buttons for approve/revise/reject
- Comments visible but internal ones hidden

### 3. Version History
- Show all versions with timestamps
- Mark current version
- Download button for each version
- Notes from uploader visible

### 4. Comments
- `isInternal: true` → only visible to agency team
- `isInternal: false` → visible to both agency and client
- Agency can toggle visibility when creating comments

---

## Summary

This reversed workflow puts the agency in control of uploading assets and sending proofs to clients for approval, rather than having external designers submit proofs to the agency.
