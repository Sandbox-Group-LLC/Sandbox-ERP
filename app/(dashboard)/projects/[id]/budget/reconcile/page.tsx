"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Link2, Unlink } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  getReconcileData,
  linkExpenseToLine,
  unlinkExpense,
  linkActualToLine,
  unlinkActual,
} from "./actions";

export const dynamic = "force-dynamic"

interface BudgetLine {
  id: string;
  section: string;
  description: string | null;
  internalCostInput: number | null;
  markupOverride: number | null;
  units: number;
}

interface ExpenseEntry {
  id: string;
  date: Date;
  description: string;
  vendor: string | null;
  amount: number;
  notes: string | null;
  budgetLineId: string | null;
}

interface ActualCostEntry {
  id: string;
  date: Date;
  description: string;
  vendor: string | null;
  amount: number;
  notes: string | null;
  budgetLineId: string | null;
}

export default function ReconcilePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [actuals, setActuals] = useState<ActualCostEntry[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [selectedActualId, setSelectedActualId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    try {
      const data = await getReconcileData(projectId);
      setBudgetLines(data.budgetLines);
      setExpenses(data.expenseEntries);
      setActuals(data.actualCostEntries);
    } catch (error) {
      console.error("Failed to load reconcile data:", error);
    } finally {
      setLoading(false);
    }
  }

  const linkedExpenses = expenses.filter((e) => e.budgetLineId === selectedLineId);
  const linkedActuals = actuals.filter((a) => a.budgetLineId === selectedLineId);
  const unlinkedExpenses = expenses.filter((e) => !e.budgetLineId);
  const unlinkedActuals = actuals.filter((a) => !a.budgetLineId);

  function handleLinkExpense() {
    if (!selectedExpenseId || !selectedLineId) return;
    startTransition(async () => {
      await linkExpenseToLine(selectedExpenseId, selectedLineId);
      await loadData();
      setSelectedExpenseId(null);
    });
  }

  function handleUnlinkExpense(expenseId: string) {
    startTransition(async () => {
      await unlinkExpense(expenseId);
      await loadData();
    });
  }

  function handleLinkActual() {
    if (!selectedActualId || !selectedLineId) return;
    startTransition(async () => {
      await linkActualToLine(selectedActualId, selectedLineId);
      await loadData();
      setSelectedActualId(null);
    });
  }

  function handleUnlinkActual(actualId: string) {
    startTransition(async () => {
      await unlinkActual(actualId);
      await loadData();
    });
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/projects/${projectId}/budget`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Budget Reconcile</h2>
          <p className="text-muted-foreground">
            Link expenses and actuals to budget lines
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Budget Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {budgetLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No budget lines</p>
              ) : (
                <div className="space-y-2">
                  {budgetLines.map((line) => (
                    <div
                      key={line.id}
                      className={`p-3 rounded-md border cursor-pointer transition-colors ${
                        selectedLineId === line.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedLineId(line.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {line.description || "Untitled"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {line.section}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-muted-foreground">
                            {line.internalCostInput
                              ? formatCurrency(line.internalCostInput * line.units)
                              : "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Linked Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedLineId ? (
              <p className="text-sm text-muted-foreground">
                Select a budget line to view linked entries
              </p>
            ) : (
              <Tabs defaultValue="expenses">
                <TabsList className="w-full">
                  <TabsTrigger value="expenses" className="flex-1">
                    Expenses ({linkedExpenses.length})
                  </TabsTrigger>
                  <TabsTrigger value="actuals" className="flex-1">
                    Actuals ({linkedActuals.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="expenses">
                  <ScrollArea className="h-[230px]">
                    {linkedExpenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No linked expenses
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {linkedExpenses.map((expense) => (
                          <div
                            key={expense.id}
                            className="p-3 rounded-md border border-border"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {expense.description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(expense.date), "MMM d, yyyy")}
                                  {expense.vendor && ` • ${expense.vendor}`}
                                </p>
                                {expense.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {expense.notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {formatCurrency(expense.amount)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleUnlinkExpense(expense.id)}
                                  disabled={isPending}
                                >
                                  <Unlink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="actuals">
                  <ScrollArea className="h-[230px]">
                    {linkedActuals.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No linked actuals
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {linkedActuals.map((actual) => (
                          <div
                            key={actual.id}
                            className="p-3 rounded-md border border-border"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {actual.description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(actual.date), "MMM d, yyyy")}
                                  {actual.vendor && ` • ${actual.vendor}`}
                                </p>
                                {actual.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {actual.notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {formatCurrency(actual.amount)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleUnlinkActual(actual.id)}
                                  disabled={isPending}
                                >
                                  <Unlink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Unlinked Expenses</CardTitle>
              {selectedLineId && selectedExpenseId && (
                <Button
                  size="sm"
                  onClick={handleLinkExpense}
                  disabled={isPending}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Link
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {unlinkedExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No unlinked expenses
                </p>
              ) : (
                <div className="space-y-2">
                  {unlinkedExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className={`p-3 rounded-md border cursor-pointer transition-colors ${
                        selectedExpenseId === expense.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedExpenseId(expense.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {expense.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(expense.date), "MMM d, yyyy")}
                            {expense.vendor && ` • ${expense.vendor}`}
                          </p>
                        </div>
                        <span className="text-sm font-medium">
                          {formatCurrency(expense.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Unlinked Actuals</CardTitle>
              {selectedLineId && selectedActualId && (
                <Button
                  size="sm"
                  onClick={handleLinkActual}
                  disabled={isPending}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Link
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {unlinkedActuals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No unlinked actuals
                </p>
              ) : (
                <div className="space-y-2">
                  {unlinkedActuals.map((actual) => (
                    <div
                      key={actual.id}
                      className={`p-3 rounded-md border cursor-pointer transition-colors ${
                        selectedActualId === actual.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedActualId(actual.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {actual.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(actual.date), "MMM d, yyyy")}
                            {actual.vendor && ` • ${actual.vendor}`}
                          </p>
                        </div>
                        <span className="text-sm font-medium">
                          {formatCurrency(actual.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
