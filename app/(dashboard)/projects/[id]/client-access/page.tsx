"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getClientAccessList,
  createClientAccess,
  revokeClientAccess,
  resendInviteEmail,
  extendClientAccess,
  ClientAccessEntry,
} from "./actions";
import { Plus, Mail, Trash2, RefreshCw, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic"

export default function ClientAccessPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { toast } = useToast();

  const [accessList, setAccessList] = useState<ClientAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  async function loadAccessList() {
    setLoading(true);
    const list = await getClientAccessList(projectId);
    setAccessList(list);
    setLoading(false);
  }

  useEffect(() => {
    loadAccessList();
  }, [projectId]);

  async function handleCreateAccess(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const result = await createClientAccess(projectId, formData);

    if (result.success) {
      toast({
        title: "Invitation Sent",
        description: `An email has been sent to ${formData.email}`,
      });
      setDialogOpen(false);
      setFormData({ firstName: "", lastName: "", email: "" });
      loadAccessList();
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to create access",
        variant: "destructive",
      });
    }

    setSubmitting(false);
  }

  async function handleRevoke(accessId: string) {
    if (!confirm("Are you sure you want to revoke this access?")) return;

    const result = await revokeClientAccess(projectId, accessId);

    if (result.success) {
      toast({ title: "Access Revoked" });
      loadAccessList();
    } else {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }
  }

  async function handleResendEmail(accessId: string) {
    const result = await resendInviteEmail(projectId, accessId);

    if (result.success) {
      toast({ title: "Email Sent", description: "Reminder email has been sent" });
    } else {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }
  }

  async function handleExtend(accessId: string) {
    const result = await extendClientAccess(projectId, accessId);

    if (result.success) {
      toast({ title: "Access Extended", description: "Extended for another 90 days" });
      loadAccessList();
    } else {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Client Budget Portal Access</h2>
          <p className="text-muted-foreground">
            Invite clients to view and comment on the budget
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invite Client to Budget Portal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAccess} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </div>
              <p className="text-sm text-muted-foreground">
                An invitation email will be sent with a link that expires in 90 days.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : accessList.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <UserPlus className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Client Access Yet</h3>
          <p className="text-muted-foreground mb-4">
            Invite clients to view and comment on the budget
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invite Your First Client
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Access</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessList.map((access) => (
                <TableRow key={access.id}>
                  <TableCell className="font-medium">
                    {access.firstName} {access.lastName}
                  </TableCell>
                  <TableCell>{access.email}</TableCell>
                  <TableCell>
                    {access.isExpired ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {access.lastAccess
                      ? new Date(access.lastAccess).toLocaleDateString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    {new Date(access.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResendEmail(access.id)}
                        title="Resend Email"
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      {access.isExpired && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExtend(access.id)}
                          title="Extend 90 Days"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(access.id)}
                        title="Revoke Access"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
