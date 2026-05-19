"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  RotateCcw,
  RefreshCw,
  CheckCircle,
  FileText,
  Upload,
  Download,
  History,
  X,
} from "lucide-react";
import { format } from "date-fns";
import {
  getCurrentUser,
  getExpenseReports,
  createExpenseReport,
  updateExpenseReport,
  deleteExpenseReport,
  submitReport,
  returnReport,
  approveReport,
  resubmitReport,
  getReportActivities,
} from "./actions";

const EXPENSE_CATEGORIES = {
  VENUE_SERVICES: "Venue Services",
  GUEST_SERVICES: "Guest Services",
  ONSITE_SUPPORT: "Onsite Staffing",
  AUDIO_VISUAL: "Audio Visual",
  CATERING: "Catering",
  ENVIRONMENTAL: "Environmental",
  CONTENT_DEVELOPMENT: "Content Development",
  DIGITAL_SERVICES: "Digital Services",
  MERCHANDISE: "Merchandise",
  INSURANCE: "Insurance",
  HEALTH_SAFETY: "Production Costs",
  TRAVEL_EXPENSES: "Travel & Expenses",
  PRODUCTION_COSTS: "Production Costs",
} as const;

const TRAVEL_SUB_CATEGORIES = [
  "Lodging",
  "Ground Transportation",
  "Flight",
  "Site Visit",
  "Expense",
] as const;

interface ExpenseLineItem {
  id: string;
  reportId: string;
  category: string;
  subCategory: string | null;
  description: string;
  amount: number;
  receiptUrl: string | null;
}

interface ExpenseReport {
  id: string;
  projectId: string;
  userId: string;
  date: Date;
  amount: number;
  category: string | null;
  description: string;
  receiptUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string | null };
  lineItems: ExpenseLineItem[];
  _count: { activities: number };
}

interface Activity {
  id: string;
  reportId: string;
  actorUserId: string;
  action: string;
  comment: string | null;
  createdAt: Date;
  actor: { id: string; name: string | null };
}

interface CurrentUser {
  id: string;
  role: string;
  name: string | null;
}

interface LineItemFormData {
  category: string;
  subCategory: string;
  description: string;
  amount: string;
  receiptUrl: string | null;
  uploading: boolean;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
  submitted: {
    label: "Submitted",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  returned: {
    label: "Returned",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
};

const actionIcons: Record<string, React.ReactNode> = {
  created: <FileText className="h-4 w-4" />,
  submitted: <Send className="h-4 w-4" />,
  returned: <RotateCcw className="h-4 w-4" />,
  resubmitted: <RefreshCw className="h-4 w-4" />,
  approved: <CheckCircle className="h-4 w-4" />,
};

function emptyLineItem(): LineItemFormData {
  return {
    category: "",
    subCategory: "",
    description: "",
    amount: "",
    receiptUrl: null,
    uploading: false,
  };
}

export function ExpenseReportsTab({ projectId }: { projectId: string }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const [editingReport, setEditingReport] = useState<ExpenseReport | null>(null);
  const [viewingReport, setViewingReport] = useState<ExpenseReport | null>(null);
  const [returningReportId, setReturningReportId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [historyReportId, setHistoryReportId] = useState<string | null>(null);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const [addDate, setAddDate] = useState("");
  const [addLineItems, setAddLineItems] = useState<LineItemFormData[]>([emptyLineItem()]);
  const [editDate, setEditDate] = useState("");
  const [editLineItems, setEditLineItems] = useState<LineItemFormData[]>([emptyLineItem()]);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    setLoading(true);
    try {
      const [userData, reportsData] = await Promise.all([
        getCurrentUser(),
        getExpenseReports(projectId),
      ]);
      setUser(userData);
      setReports(reportsData);
    } catch (error) {
      console.error("Failed to load expense reports:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadReceiptForLine(
    file: File,
    setLineItems: React.Dispatch<React.SetStateAction<LineItemFormData[]>>,
    index: number
  ) {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, uploading: true } : item));

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      const { uploadUrl, storagePath } = await res.json();

      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      setLineItems(prev => prev.map((item, i) => i === index ? { ...item, receiptUrl: storagePath, uploading: false } : item));
    } catch (error) {
      console.error("Failed to upload receipt:", error);
      setLineItems(prev => prev.map((item, i) => i === index ? { ...item, uploading: false } : item));
    }
  }

  async function handleDownloadReceipt(storagePath: string) {
    try {
      const res = await fetch("/api/storage-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath }),
      });
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (error) {
      console.error("Failed to get receipt URL:", error);
    }
  }

  function updateLineItem(
    setLineItems: React.Dispatch<React.SetStateAction<LineItemFormData[]>>,
    index: number,
    field: keyof LineItemFormData,
    value: string | null
  ) {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === "category" && value !== "TRAVEL_EXPENSES") {
        updated.subCategory = "";
      }
      return updated;
    }));
  }

  function addLineItemRow(
    setLineItems: React.Dispatch<React.SetStateAction<LineItemFormData[]>>
  ) {
    setLineItems(prev => [...prev, emptyLineItem()]);
  }

  function removeLineItemRow(
    setLineItems: React.Dispatch<React.SetStateAction<LineItemFormData[]>>,
    index: number
  ) {
    setLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  }

  function computeTotal(lineItems: LineItemFormData[]): number {
    return lineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }

  async function handleAdd() {
    setSubmitting(true);
    try {
      const items = addLineItems.map((li) => ({
        category: li.category,
        subCategory: li.category === "TRAVEL_EXPENSES" && li.subCategory ? li.subCategory : undefined,
        description: li.description,
        amount: parseFloat(li.amount) || 0,
        receiptUrl: li.receiptUrl || undefined,
      }));

      await createExpenseReport(projectId, {
        date: addDate,
        lineItems: items,
      });
      setAddDialogOpen(false);
      setAddDate("");
      setAddLineItems([emptyLineItem()]);
      await loadData();
    } catch (error) {
      console.error("Failed to create report:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!editingReport) return;
    setSubmitting(true);
    try {
      const items = editLineItems.map((li) => ({
        category: li.category,
        subCategory: li.category === "TRAVEL_EXPENSES" && li.subCategory ? li.subCategory : undefined,
        description: li.description,
        amount: parseFloat(li.amount) || 0,
        receiptUrl: li.receiptUrl || undefined,
      }));

      await updateExpenseReport(editingReport.id, {
        date: editDate,
        lineItems: items,
      });
      setEditDialogOpen(false);
      setEditingReport(null);
      await loadData();
    } catch (error) {
      console.error("Failed to update report:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Are you sure you want to delete this expense report?")) return;
    try {
      await deleteExpenseReport(reportId);
      await loadData();
    } catch (error) {
      console.error("Failed to delete report:", error);
    }
  }

  async function handleSubmit(reportId: string) {
    try {
      await submitReport(reportId);
      await loadData();
    } catch (error) {
      console.error("Failed to submit report:", error);
    }
  }

  async function handleReturn() {
    if (!returningReportId || !returnComment.trim()) return;
    setSubmitting(true);
    try {
      await returnReport(returningReportId, returnComment);
      setReturnDialogOpen(false);
      setReturningReportId(null);
      setReturnComment("");
      await loadData();
    } catch (error) {
      console.error("Failed to return report:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(reportId: string) {
    try {
      await approveReport(reportId);
      await loadData();
    } catch (error) {
      console.error("Failed to approve report:", error);
    }
  }

  async function handleResubmit(reportId: string) {
    try {
      await resubmitReport(reportId);
      await loadData();
    } catch (error) {
      console.error("Failed to resubmit report:", error);
    }
  }

  async function openHistory(reportId: string) {
    setHistoryReportId(reportId);
    setHistoryDialogOpen(true);
    setActivitiesLoading(true);
    try {
      const data = await getReportActivities(reportId);
      setActivities(data);
    } catch (error) {
      console.error("Failed to load activities:", error);
    } finally {
      setActivitiesLoading(false);
    }
  }

  function openEditDialog(report: ExpenseReport) {
    setEditingReport(report);
    setEditDate(format(new Date(report.date), "yyyy-MM-dd"));
    if (report.lineItems && report.lineItems.length > 0) {
      setEditLineItems(
        report.lineItems.map((li) => ({
          category: li.category,
          subCategory: li.subCategory || "",
          description: li.description,
          amount: String(li.amount),
          receiptUrl: li.receiptUrl,
          uploading: false,
        }))
      );
    } else {
      setEditLineItems([
        {
          category: report.category || "",
          subCategory: "",
          description: report.description,
          amount: String(report.amount),
          receiptUrl: report.receiptUrl,
          uploading: false,
        },
      ]);
    }
    setEditDialogOpen(true);
  }

  function openReturnDialog(reportId: string) {
    setReturningReportId(reportId);
    setReturnComment("");
    setReturnDialogOpen(true);
  }

  function getCategoryLabel(key: string): string {
    return (EXPENSE_CATEGORIES as any)[key] || key;
  }

  function getLineItemsSummary(report: ExpenseReport): string {
    if (report.lineItems && report.lineItems.length > 0) {
      if (report.lineItems.length === 1) {
        return getCategoryLabel(report.lineItems[0].category);
      }
      return `${report.lineItems.length} items`;
    }
    return report.category ? getCategoryLabel(report.category) : "—";
  }

  const isAdmin = user?.role === "ADMIN";
  const totalAmount = (reports || []).reduce((sum, r) => sum + r.amount, 0);
  const anyUploading = (items: LineItemFormData[]) => items.some((i) => i.uploading);

  if (loading) {
    return <div className="text-muted-foreground">Loading expense reports...</div>;
  }

  function renderLineItemForm(
    lineItems: LineItemFormData[],
    setLineItems: React.Dispatch<React.SetStateAction<LineItemFormData[]>>
  ) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Line Items</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addLineItemRow(setLineItems)}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Line Item
          </Button>
        </div>

        {lineItems.map((item, index) => (
          <div
            key={index}
            className="border rounded-lg p-4 space-y-3 relative"
          >
            {lineItems.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={() => removeLineItemRow(setLineItems, index)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={item.category}
                  onValueChange={(val) =>
                    updateLineItem(setLineItems, index, "category", val)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {item.category === "TRAVEL_EXPENSES" && (
                <div className="space-y-1.5">
                  <Label>Sub-Category</Label>
                  <Select
                    value={item.subCategory}
                    onValueChange={(val) =>
                      updateLineItem(setLineItems, index, "subCategory", val)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sub-category" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAVEL_SUB_CATEGORIES.map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={item.description}
                onChange={(e) =>
                  updateLineItem(setLineItems, index, "description", e.target.value)
                }
                placeholder="Enter description"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.amount}
                  onChange={(e) =>
                    updateLineItem(setLineItems, index, "amount", e.target.value)
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Receipt</Label>
                {item.receiptUrl ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadReceipt(item.receiptUrl!)}
                    >
                      <Download className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateLineItem(setLineItems, index, "receiptUrl", null)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadReceiptForLine(file, setLineItems, index);
                      }}
                    />
                    {item.uploading && (
                      <span className="text-sm text-muted-foreground">Uploading...</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="flex justify-end border-t pt-3">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-xl font-bold">
              ${computeTotal(lineItems).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Expense Reports</h2>
          <p className="text-sm text-muted-foreground">
            Submit and track expense reports for review
          </p>
        </div>
        <Button
          onClick={() => {
            setAddDate("");
            setAddLineItems([emptyLineItem()]);
            setAddDialogOpen(true);
          }}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Report
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Amount
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No expense reports yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead>Submitted By</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => {
                const isCreator = report.userId === user?.id;
                const badge = statusBadge[report.status] || statusBadge.draft;

                return (
                  <TableRow
                    key={report.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setViewingReport(report);
                      setViewDialogOpen(true);
                    }}
                  >
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(report.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{getLineItemsSummary(report)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      ${Number(report.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>{report.user.name || "Unknown"}</TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {report.status === "draft" && (isCreator || isAdmin) && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(report)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(report.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {isCreator && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleSubmit(report.id)}
                                title="Submit"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          </>
                        )}

                        {report.status === "submitted" && isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openReturnDialog(report.id)}
                              title="Return to Employee"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleApprove(report.id)}
                              title="Approve"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        {report.status === "returned" && isCreator && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(report)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResubmit(report.id)}
                              title="Resubmit"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openHistory(report.id)}
                          title="View History"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* View Report Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={(open) => {
        setViewDialogOpen(open);
        if (!open) setViewingReport(null);
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Expense Report Details</DialogTitle>
          </DialogHeader>
          {viewingReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(viewingReport.date), "MMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="secondary" className={(statusBadge[viewingReport.status] || statusBadge.draft).className}>
                    {(statusBadge[viewingReport.status] || statusBadge.draft).label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Submitted By</p>
                  <p className="font-medium">{viewingReport.user.name || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Amount</p>
                  <p className="font-medium">
                    ${Number(viewingReport.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {viewingReport.lineItems && viewingReport.lineItems.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Line Items</Label>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewingReport.lineItems.map((li) => (
                          <TableRow key={li.id}>
                            <TableCell>
                              <div>
                                {getCategoryLabel(li.category)}
                                {li.subCategory && (
                                  <span className="block text-xs text-muted-foreground">
                                    {li.subCategory}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{li.description}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              ${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>
                              {li.receiptUrl ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownloadReceipt(li.receiptUrl!)}
                                >
                                  <Download className="h-4 w-4 mr-1" /> View
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  <p className="text-muted-foreground">Description</p>
                  <p>{viewingReport.description}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Report Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Expense Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-date">Date</Label>
              <Input
                id="add-date"
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                required
              />
            </div>

            {renderLineItemForm(addLineItems, setAddLineItems)}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  submitting ||
                  anyUploading(addLineItems) ||
                  !addDate ||
                  addLineItems.some((li) => !li.category || !li.description || !li.amount)
                }
                onClick={handleAdd}
              >
                {submitting ? "Creating..." : "Create Report"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Report Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setEditingReport(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Expense Report</DialogTitle>
          </DialogHeader>
          {editingReport && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>

              {renderLineItemForm(editLineItems, setEditLineItems)}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    submitting ||
                    anyUploading(editLineItems) ||
                    !editDate ||
                    editLineItems.some((li) => !li.category || !li.description || !li.amount)
                  }
                  onClick={handleEdit}
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={(open) => {
        setReturnDialogOpen(open);
        if (!open) {
          setReturningReportId(null);
          setReturnComment("");
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return to Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="return-comment">
                Comment <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="return-comment"
                placeholder="Explain what needs to be fixed..."
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleReturn}
                disabled={submitting || !returnComment.trim()}
              >
                {submitting ? "Returning..." : "Return to Employee"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={(open) => {
        setHistoryDialogOpen(open);
        if (!open) {
          setHistoryReportId(null);
          setActivities([]);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workflow History</DialogTitle>
          </DialogHeader>
          {activitiesLoading ? (
            <div className="text-muted-foreground py-4">Loading history...</div>
          ) : activities.length === 0 ? (
            <div className="text-muted-foreground py-4">No activity recorded.</div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {actionIcons[activity.action] || <FileText className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium capitalize">{activity.action}</span>{" "}
                      by {activity.actor.name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(activity.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                    {activity.comment && (
                      <div className="mt-1 rounded-md bg-muted p-2 text-sm text-muted-foreground">
                        {activity.comment}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
