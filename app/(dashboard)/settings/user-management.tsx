"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Check, X, Shield, User as UserIcon, Clock, Ban, MoreHorizontal, Mail, Send, RefreshCw, Trash2, HelpCircle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const ROLE_DESCRIPTIONS = {
  ADMIN: "Full access to all features including user management, settings, budgets, contracts, and all project data",
  MEMBER: "Access to projects, budgets, staffing, contracts, actuals, and internal features. Cannot manage users or system settings",
  EXTERNAL: "Limited access to assigned projects. Can view client budget, project plan, purchases, shipping, assets, proofs, and space allocation only",
  CLIENT: "Client-facing access only. Can view client budget, project plan, assets, space allocation, and approve proofs",
} as const
import { getUsers, approveUser, denyUser, updateUserRole, revokeAccess } from "./user-actions"
import { createInvite, getInvites, revokeInvite, resendInvite } from "./invite-actions"

type User = {
  id: string
  email: string | null
  name: string | null
  firstName: string | null
  lastName: string | null
  profileImageUrl: string | null
  role: string
  approvalStatus: string
  approvedAt: Date | null
  createdAt: Date
  approvedBy: { name: string | null; email: string | null } | null
}

type Invite = {
  id: string
  email: string
  role: string
  expiresAt: Date
  createdAt: Date
  invitedBy: { name: string | null; email: string | null }
}

export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT'>('MEMBER')
  const [sendingInvite, setSendingInvite] = useState(false)
  const { toast } = useToast()

  const loadData = async () => {
    try {
      const [userData, inviteData] = await Promise.all([getUsers(), getInvites()])
      setUsers(userData)
      setInvites(inviteData)
    } catch (error) {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast({ title: "Error", description: "Please enter an email address", variant: "destructive" })
      return
    }
    
    setSendingInvite(true)
    try {
      await createInvite(inviteEmail, inviteRole)
      toast({ title: "Invite sent", description: `Invitation sent to ${inviteEmail}` })
      setInviteEmail("")
      setInviteRole('MEMBER')
      loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setSendingInvite(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvite(inviteId)
      toast({ title: "Invite revoked" })
      loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleResendInvite = async (inviteId: string) => {
    try {
      await resendInvite(inviteId)
      toast({ title: "Invite resent", description: "A new invitation email has been sent" })
      loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleApprove = async (userId: string, role: 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT') => {
    try {
      await approveUser(userId, role)
      toast({ title: "User approved", description: "The user now has access" })
      loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleDeny = async (userId: string) => {
    try {
      await denyUser(userId)
      toast({ title: "Access denied", description: "The user's request has been denied" })
      loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleRoleChange = async (userId: string, role: 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT') => {
    try {
      await updateUserRole(userId, role)
      toast({ title: "Role updated" })
      loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleRevoke = async (userId: string) => {
    try {
      await revokeAccess(userId)
      toast({ title: "Access revoked" })
      loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const pendingUsers = users.filter(u => u.approvalStatus === 'PENDING')
  const approvedUsers = users.filter(u => u.approvalStatus === 'APPROVED')
  const deniedUsers = users.filter(u => u.approvalStatus === 'DENIED')

  const getDisplayName = (user: User) => {
    return user.name || user.firstName || user.email?.split('@')[0] || 'Unknown User'
  }

  const getInitials = (user: User) => {
    const name = getDisplayName(user)
    return name.slice(0, 2).toUpperCase()
  }

  const isExpired = (expiresAt: Date) => {
    return new Date(expiresAt) < new Date()
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invite User
          </CardTitle>
          <CardDescription>Send an invitation to join your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              placeholder="Enter email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendInvite()
              }}
            />
            <div className="flex items-center gap-1">
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT')}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="EXTERNAL">External</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" type="button">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" className="w-80">
                  <div className="space-y-3 text-sm">
                    <h4 className="font-medium">User Role Access Levels</h4>
                    <div className="space-y-2">
                      <p><strong>Admin:</strong> {ROLE_DESCRIPTIONS.ADMIN}</p>
                      <p><strong>Member:</strong> {ROLE_DESCRIPTIONS.MEMBER}</p>
                      <p><strong>External:</strong> {ROLE_DESCRIPTIONS.EXTERNAL}</p>
                      <p><strong>Client:</strong> {ROLE_DESCRIPTIONS.CLIENT}</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleSendInvite} disabled={sendingInvite}>
              <Send className="h-4 w-4 mr-2" />
              {sendingInvite ? "Sending..." : "Send Invite"}
            </Button>
          </div>

          {invites.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3 text-muted-foreground">Pending Invitations</h4>
              <div className="space-y-2">
                {invites.map(invite => (
                  <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg dark:border-gray-700 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Mail className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-sm dark:text-white">{invite.email}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">{invite.role}</Badge>
                          <span>•</span>
                          <span>Sent {new Date(invite.createdAt).toLocaleDateString()}</span>
                          <span>•</span>
                          {isExpired(invite.expiresAt) ? (
                            <span className="text-red-500">Expired</span>
                          ) : (
                            <span>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleResendInvite(invite.id)}>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Resend
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => handleRevokeInvite(invite.id)}>
                        <Trash2 className="h-3 w-3 mr-1" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pendingUsers.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Pending Requests ({pendingUsers.length})
            </CardTitle>
            <CardDescription>Users waiting for access approval</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingUsers.map(user => (
                <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg dark:border-gray-700 gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.profileImageUrl || undefined} />
                      <AvatarFallback>{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium dark:text-white">{getDisplayName(user)}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => handleApprove(user.id, 'MEMBER')} className="flex-1 sm:flex-none">
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleApprove(user.id, 'ADMIN')} className="flex-1 sm:flex-none">
                      <Shield className="h-4 w-4 mr-1" />
                      Approve as Admin
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeny(user.id)} className="flex-1 sm:flex-none">
                      <X className="h-4 w-4 mr-1" />
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            Active Users ({approvedUsers.length})
          </CardTitle>
          <CardDescription>Users with access to the system</CardDescription>
        </CardHeader>
        <CardContent>
          {approvedUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No active users</p>
          ) : (
            <div className="space-y-3">
              {approvedUsers.map(user => (
                <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg dark:border-gray-700 gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.profileImageUrl || undefined} />
                      <AvatarFallback>{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium dark:text-white">{getDisplayName(user)}</p>
                        {user.id === currentUserId && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleRoleChange(user.id, value as 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT')}
                      disabled={user.id === currentUserId}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="EXTERNAL">External</SelectItem>
                        <SelectItem value="CLIENT">Client</SelectItem>
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" type="button">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="left" className="w-72">
                        <div className="space-y-2 text-sm">
                          <h4 className="font-medium">{user.role} Access</h4>
                          <p>{ROLE_DESCRIPTIONS[user.role as keyof typeof ROLE_DESCRIPTIONS]}</p>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {user.id !== currentUserId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handleRevoke(user.id)}
                            className="text-red-600 dark:text-red-400"
                          >
                            Revoke Access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {deniedUsers.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" />
              Denied Users ({deniedUsers.length})
            </CardTitle>
            <CardDescription>Users who have been denied access</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deniedUsers.map(user => (
                <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg dark:border-gray-700 gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="opacity-50">
                      <AvatarImage src={user.profileImageUrl || undefined} />
                      <AvatarFallback>{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-muted-foreground">{getDisplayName(user)}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleApprove(user.id, 'MEMBER')}>
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
