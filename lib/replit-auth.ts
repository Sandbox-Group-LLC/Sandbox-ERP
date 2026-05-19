import * as client from "openid-client";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { sendAccessRequestEmail } from './resend';

// Super admin email - always auto-approved, never needs approval
const SUPER_ADMIN_EMAIL = "brian@makemysandbox.com";

const getOidcConfig = async () => {
  return await client.discovery(
    new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
    process.env.REPL_ID!
  );
};

export interface ReplitUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export async function getAuthorizationUrl(hostname: string, inviteToken?: string): Promise<string> {
  const config = await getOidcConfig();
  const callbackUrl = `https://${hostname}/api/auth/callback`;
  
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const randomState = client.randomState();
  
  const stateData = inviteToken 
    ? JSON.stringify({ s: randomState, i: inviteToken })
    : randomState;
  const encodedState = Buffer.from(stateData).toString('base64url');
  
  const cookieStore = await cookies();
  cookieStore.set("code_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("oauth_state", encodedState, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 600,
    path: "/",
  });

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: encodedState,
  });

  return authUrl.href;
}

function parseOAuthState(encodedState: string): { randomState: string; inviteToken?: string } {
  try {
    const decoded = Buffer.from(encodedState, 'base64url').toString('utf-8');
    if (decoded.startsWith('{')) {
      const parsed = JSON.parse(decoded);
      return { randomState: parsed.s, inviteToken: parsed.i };
    }
    return { randomState: decoded };
  } catch {
    return { randomState: encodedState };
  }
}

export async function handleCallback(
  hostname: string,
  searchParams: URLSearchParams
): Promise<{ user: ReplitUser; sessionId: string; inviteToken?: string } | { error: string }> {
  const config = await getOidcConfig();
  const callbackUrl = `https://${hostname}/api/auth/callback`;
  
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("code_verifier")?.value;
  const storedState = cookieStore.get("oauth_state")?.value;

  if (!codeVerifier) {
    return { error: "Missing code verifier - please enable cookies" };
  }

  const state = searchParams.get("state");
  if (!storedState) {
    return { error: "Missing state - please enable cookies" };
  }
  
  if (state !== storedState) {
    return { error: "State mismatch" };
  }

  const { inviteToken } = parseOAuthState(storedState);

  try {
    const tokens = await client.authorizationCodeGrant(config, new URL(`${callbackUrl}?${searchParams.toString()}`), {
      pkceCodeVerifier: codeVerifier,
      expectedState: storedState,
    });

    const claims = tokens.claims();
    if (!claims) {
      return { error: "No claims in token" };
    }

    const userId = claims.sub;
    const email = claims.email as string | undefined;
    const firstName = claims.first_name as string | undefined;
    const lastName = claims.last_name as string | undefined;
    const profileImageUrl = claims.profile_image_url as string | undefined;
    const displayName = firstName && lastName ? `${firstName} ${lastName}` : firstName || email?.split("@")[0] || "User";

    let existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    let user;
    // Check if this is the super admin email
    const isSuperAdmin = email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    
    if (existingUser) {
      // Existing user - update profile
      // Also auto-approve super admin if they're pending
      const updateData: any = {
        email: email || null,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: profileImageUrl || null,
        updatedAt: new Date(),
      };
      
      // Auto-approve super admin on every login
      if (isSuperAdmin && existingUser.approvalStatus !== 'APPROVED') {
        updateData.approvalStatus = 'APPROVED';
        updateData.role = 'ADMIN';
      }
      
      user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    } else {
      // New user - check for valid invite first
      // Security: Must validate BOTH email AND token to prevent cross-org hijacking
      let validInvite = null;
      if (email && inviteToken) {
        validInvite = await prisma.userInvite.findFirst({
          where: {
            email: email.toLowerCase(),
            token: inviteToken,
            acceptedAt: null,
            expiresAt: { gt: new Date() }
          },
          include: { organization: true }
        });
      }

      if (validInvite) {
        // User has a valid invite - auto-approve with invite's role and organization
        user = await prisma.user.create({
          data: {
            id: userId,
            email: email || null,
            firstName: firstName || null,
            lastName: lastName || null,
            profileImageUrl: profileImageUrl || null,
            name: displayName,
            role: validInvite.role,
            organizationId: validInvite.organizationId,
            approvalStatus: "APPROVED",
          },
        });

        // Mark the invite as accepted
        await prisma.userInvite.update({
          where: { id: validInvite.id },
          data: { acceptedAt: new Date() }
        });
      } else {
        // No invite - check if any organization exists
        const existingOrg = await prisma.organization.findFirst();
      
        if (existingOrg) {
          if (isSuperAdmin) {
            user = await prisma.user.create({
              data: {
                id: userId,
                email: email || null,
                firstName: firstName || null,
                lastName: lastName || null,
                profileImageUrl: profileImageUrl || null,
                name: displayName,
                role: "ADMIN",
                organizationId: existingOrg.id,
                approvalStatus: "APPROVED",
              },
            });
          } else {
            user = await prisma.user.create({
              data: {
                id: userId,
                email: email || null,
                firstName: firstName || null,
                lastName: lastName || null,
                profileImageUrl: profileImageUrl || null,
                name: displayName,
                role: "MEMBER",
                organizationId: null,
                approvalStatus: "APPROVED",
              },
            });
          }
        } else {
        // First user - create organization and auto-approve as admin
        const organization = await prisma.organization.create({
          data: {
            name: `${displayName}'s Organization`,
          },
        });

        user = await prisma.user.create({
          data: {
            id: userId,
            email: email || null,
            firstName: firstName || null,
            lastName: lastName || null,
            profileImageUrl: profileImageUrl || null,
            name: displayName,
            role: "ADMIN",
            organizationId: organization.id,
            approvalStatus: "APPROVED",
          },
        });
        }
      }
    }

    const sessionId = crypto.randomUUID();
    const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.upsert({
      where: { sid: sessionId },
      update: {
        sess: {
          userId: user.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: claims.exp,
        },
        expire: sessionExpiry,
      },
      create: {
        sid: sessionId,
        sess: {
          userId: user.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: claims.exp,
        },
        expire: sessionExpiry,
      },
    });

    cookieStore.delete("code_verifier");
    cookieStore.delete("oauth_state");
    // Don't set cookie here - let /api/auth/session route set it as first-party navigation

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      },
      sessionId,
    };
  } catch (error) {
    console.error("Auth callback error:", error);
    return { error: "Authentication failed" };
  }
}

export async function getCurrentUser(): Promise<ReplitUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  if (!sessionId) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { sid: sessionId },
  });

  if (!session || new Date(session.expire) < new Date()) {
    return null;
  }

  const sessionData = session.sess as { userId: string };
  const user = await prisma.user.findUnique({
    where: { id: sessionData.userId },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
}

export async function getUserWithOrganization() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  if (!sessionId) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { sid: sessionId },
  });

  if (!session || new Date(session.expire) < new Date()) {
    return null;
  }

  const sessionData = session.sess as { userId: string };
  const user = await prisma.user.findUnique({
    where: { id: sessionData.userId },
    include: { organization: true },
  });

  return user;
}

export async function logout(hostname: string): Promise<string> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  if (sessionId) {
    await prisma.session.delete({
      where: { sid: sessionId },
    }).catch(() => {});
    cookieStore.delete("session_id");
  }

  const config = await getOidcConfig();
  const postLogoutRedirectUri = `https://${hostname}/login`;
  
  return client.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutRedirectUri,
  }).href;
}
