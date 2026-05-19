"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Trash2,
  Calendar,
  Grid3X3,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { exportRunOfShowToExcel } from "./export";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import {
  getRunOfShows,
  createRunOfShow,
  updateRunOfShow,
  deleteRunOfShow,
  addSpace,
  updateSpace,
  deleteSpace,
  updateCell,
} from "./actions";
import { useToast } from "@/hooks/use-toast";

type RunOfShowCell = {
  id: string;
  spaceId: string;
  date: Date;
  content: string | null;
};

type RunOfShowSpace = {
  id: string;
  runOfShowId: string;
  rowOrder: number;
  function: string | null;
  capacity: string | null;
  venueSpace: string | null;
  cells: RunOfShowCell[];
};

type RunOfShow = {
  id: string;
  projectId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  spaces: RunOfShowSpace[];
};

interface SpaceAllocationTabProps {
  projectId: string;
  projectName?: string;
}

export function SpaceAllocationTab({ projectId, projectName = "Project" }: SpaceAllocationTabProps) {
  const [runOfShows, setRunOfShows] = useState<RunOfShow[]>([]);
  const [selectedRos, setSelectedRos] = useState<RunOfShow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddSpaceDialog, setShowAddSpaceDialog] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      const data = await getRunOfShows(projectId);
      setRunOfShows(data);
      if (data.length > 0 && !selectedRos) {
        setSelectedRos(data[0]);
      } else if (selectedRos) {
        const updated = data.find((r) => r.id === selectedRos.id);
        setSelectedRos(updated || null);
      }
    } catch (error) {
      console.error("Failed to load run of shows:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  if (loading) {
    return <div className="text-muted-foreground">Loading space allocation...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Space Allocation</h2>
          <p className="text-sm text-muted-foreground">
            Manage venue spaces and schedules for your event
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Run of Show
            </Button>
          </DialogTrigger>
          <CreateRunOfShowDialog
            projectId={projectId}
            onSuccess={(ros) => {
              setRunOfShows((prev) => [ros, ...prev]);
              setSelectedRos(ros);
              setShowCreateDialog(false);
              toast({ title: "Run of Show created" });
            }}
            onClose={() => setShowCreateDialog(false)}
          />
        </Dialog>
      </div>

      {runOfShows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Grid3X3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No run of shows yet</p>
            <p className="text-sm text-muted-foreground">
              Create a run of show to start planning your venue spaces
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {runOfShows.map((ros) => (
              <Button
                key={ros.id}
                variant={selectedRos?.id === ros.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedRos(ros)}
              >
                {ros.name}
              </Button>
            ))}
          </div>

          {selectedRos && (
            <RunOfShowGrid
              runOfShow={selectedRos}
              projectName={projectName}
              onRefresh={loadData}
              onDelete={async () => {
                try {
                  await deleteRunOfShow(selectedRos.id);
                  setRunOfShows((prev) => prev.filter((r) => r.id !== selectedRos.id));
                  setSelectedRos(runOfShows.length > 1 ? runOfShows[0] : null);
                  toast({ title: "Run of Show deleted" });
                } catch (error) {
                  toast({ title: "Failed to delete", variant: "destructive" });
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CreateRunOfShowDialog({
  projectId,
  onSuccess,
  onClose,
}: {
  projectId: string;
  onSuccess: (ros: RunOfShow) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;

    setSaving(true);
    try {
      const ros = await createRunOfShow({
        projectId,
        name,
        startDate: new Date(startDate + "T12:00:00.000Z"),
        endDate: new Date(endDate + "T12:00:00.000Z"),
      });
      onSuccess(ros as RunOfShow);
    } catch (error) {
      console.error("Failed to create run of show:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create Run of Show</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Main Event Space Allocation"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RunOfShowGrid({
  runOfShow,
  projectName,
  onRefresh,
  onDelete,
}: {
  runOfShow: RunOfShow;
  projectName: string;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [showAddSpaceDialog, setShowAddSpaceDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    spaceId: string;
    date: Date;
    content: string;
  } | null>(null);
  const { toast } = useToast();

  const startStr = typeof runOfShow.startDate === 'string'
    ? (runOfShow.startDate as string).split('T')[0]
    : new Date(runOfShow.startDate).toISOString().split('T')[0];
  const endStr = typeof runOfShow.endDate === 'string'
    ? (runOfShow.endDate as string).split('T')[0]
    : new Date(runOfShow.endDate).toISOString().split('T')[0];
  const dates = eachDayOfInterval({
    start: parseISO(startStr),
    end: parseISO(endStr),
  });

  const getCellContent = (space: RunOfShowSpace, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const cell = space.cells.find((c) => {
      const cellStr = typeof c.date === 'string'
        ? (c.date as string).split('T')[0]
        : new Date(c.date).toISOString().split('T')[0];
      return cellStr === dateStr;
    });
    return cell?.content || "";
  };

  const handleCellClick = (space: RunOfShowSpace, date: Date) => {
    const content = getCellContent(space, date);
    setEditingCell({ spaceId: space.id, date, content });
  };

  const handleCellSave = async () => {
    if (!editingCell) return;

    try {
      const d = editingCell.date;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await updateCell(
        editingCell.spaceId,
        dateStr,
        editingCell.content || null
      );
      onRefresh();
      setEditingCell(null);
    } catch (error) {
      toast({ title: "Failed to save cell", variant: "destructive" });
    }
  };

  const handleAddSpace = async (data: {
    function?: string;
    capacity?: string;
    venueSpace?: string;
  }) => {
    try {
      await addSpace(runOfShow.id, data);
      onRefresh();
      setShowAddSpaceDialog(false);
      toast({ title: "Space added" });
    } catch (error) {
      toast({ title: "Failed to add space", variant: "destructive" });
    }
  };

  const handleDeleteSpace = async (spaceId: string) => {
    try {
      await deleteSpace(spaceId);
      onRefresh();
      toast({ title: "Space deleted" });
    } catch (error) {
      toast({ title: "Failed to delete space", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{runOfShow.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {format(parseISO(typeof runOfShow.startDate === 'string'
                ? (runOfShow.startDate as string).split('T')[0]
                : new Date(runOfShow.startDate).toISOString().split('T')[0]), "MMM d, yyyy")} -{" "}
              {format(parseISO(typeof runOfShow.endDate === 'string'
                ? (runOfShow.endDate as string).split('T')[0]
                : new Date(runOfShow.endDate).toISOString().split('T')[0]), "MMM d, yyyy")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Dates
                </Button>
              </DialogTrigger>
              <EditRunOfShowDialog
                runOfShow={runOfShow}
                onSuccess={() => {
                  setShowEditDialog(false);
                  onRefresh();
                  toast({ title: "Run of Show updated" });
                }}
                onClose={() => setShowEditDialog(false)}
              />
            </Dialog>
            <Dialog open={showAddSpaceDialog} onOpenChange={setShowAddSpaceDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Row
                </Button>
              </DialogTrigger>
              <AddSpaceDialog
                onAdd={handleAddSpace}
                onClose={() => setShowAddSpaceDialog(false)}
              />
            </Dialog>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => exportRunOfShowToExcel(runOfShow, projectName)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border p-2 text-left font-medium min-w-[150px] sticky left-0 bg-muted/50 z-10">
                  Function
                </th>
                <th className="border p-2 text-left font-medium min-w-[120px] sticky left-[150px] bg-muted/50 z-10">
                  Capacity & Setup
                </th>
                <th className="border p-2 text-left font-medium min-w-[120px] sticky left-[270px] bg-muted/50 z-10">
                  Venue Space
                </th>
                {dates.map((date) => (
                  <th
                    key={date.toISOString()}
                    className="border p-2 text-center font-medium min-w-[140px]"
                  >
                    <div>{format(date, "EEEE")}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(date, "MMM d, yyyy")}
                    </div>
                  </th>
                ))}
                <th className="border p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(!runOfShow.spaces || runOfShow.spaces.length === 0) ? (
                <tr>
                  <td
                    colSpan={4 + dates.length}
                    className="border p-8 text-center text-muted-foreground"
                  >
                    No spaces added yet. Click "Add Row" to add a venue space.
                  </td>
                </tr>
              ) : (
                runOfShow.spaces.map((space) => (
                  <SpaceRow
                    key={space.id}
                    space={space}
                    dates={dates}
                    getCellContent={getCellContent}
                    onCellClick={handleCellClick}
                    onDelete={handleDeleteSpace}
                    onRefresh={onRefresh}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={!!editingCell} onOpenChange={(open) => !open && setEditingCell(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit Cell - {editingCell && format(editingCell.date, "EEEE, MMM d, yyyy")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={editingCell?.content || ""}
                onChange={(e) =>
                  setEditingCell((prev) =>
                    prev ? { ...prev, content: e.target.value } : null
                  )
                }
                placeholder="Enter activity details (times, events, notes...)"
                rows={6}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingCell(null)}>
                  Cancel
                </Button>
                <Button onClick={handleCellSave}>Save</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function SpaceRow({
  space,
  dates,
  getCellContent,
  onCellClick,
  onDelete,
  onRefresh,
}: {
  space: RunOfShowSpace;
  dates: Date[];
  getCellContent: (space: RunOfShowSpace, date: Date) => string;
  onCellClick: (space: RunOfShowSpace, date: Date) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    function: space.function || "",
    capacity: space.capacity || "",
    venueSpace: space.venueSpace || "",
  });
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await updateSpace(space.id, editData);
      onRefresh();
      setEditing(false);
    } catch (error) {
      toast({ title: "Failed to update space", variant: "destructive" });
    }
  };

  return (
    <tr className="hover:bg-muted/30">
      <td className="border p-2 sticky left-0 bg-background z-10 min-w-[150px]">
        {editing ? (
          <Input
            value={editData.function}
            onChange={(e) => setEditData((p) => ({ ...p, function: e.target.value }))}
            className="h-8 text-sm"
          />
        ) : (
          <div
            className="cursor-pointer hover:text-primary whitespace-pre-wrap"
            onClick={() => setEditing(true)}
          >
            {space.function || <span className="text-muted-foreground italic">Click to edit</span>}
          </div>
        )}
      </td>
      <td className="border p-2 sticky left-[150px] bg-background z-10 min-w-[120px]">
        {editing ? (
          <Input
            value={editData.capacity}
            onChange={(e) => setEditData((p) => ({ ...p, capacity: e.target.value }))}
            className="h-8 text-sm"
          />
        ) : (
          <div
            className="cursor-pointer hover:text-primary whitespace-pre-wrap"
            onClick={() => setEditing(true)}
          >
            {space.capacity || <span className="text-muted-foreground italic">-</span>}
          </div>
        )}
      </td>
      <td className="border p-2 sticky left-[270px] bg-background z-10 min-w-[120px]">
        {editing ? (
          <div className="flex gap-1">
            <Input
              value={editData.venueSpace}
              onChange={(e) => setEditData((p) => ({ ...p, venueSpace: e.target.value }))}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8" onClick={handleSave}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div
            className="cursor-pointer hover:text-primary whitespace-pre-wrap"
            onClick={() => setEditing(true)}
          >
            {space.venueSpace || <span className="text-muted-foreground italic">-</span>}
          </div>
        )}
      </td>
      {dates.map((date) => {
        const content = getCellContent(space, date);
        return (
          <td
            key={date.toISOString()}
            className="border p-2 cursor-pointer hover:bg-primary/5 transition-colors align-top"
            onClick={() => onCellClick(space, date)}
          >
            <div className="whitespace-pre-wrap text-xs min-h-[40px]">
              {content || (
                <span className="text-muted-foreground italic">Click to add</span>
              )}
            </div>
          </td>
        );
      })}
      <td className="border p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={() => onDelete(space.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function AddSpaceDialog({
  onAdd,
  onClose,
}: {
  onAdd: (data: { function?: string; capacity?: string; venueSpace?: string }) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    function: "",
    capacity: "",
    venueSpace: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onAdd(formData);
    setSaving(false);
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add Space/Room</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="function">Function</Label>
          <Input
            id="function"
            value={formData.function}
            onChange={(e) => setFormData((p) => ({ ...p, function: e.target.value }))}
            placeholder="e.g., Briefing Room, Demo Space"
          />
        </div>
        <div>
          <Label htmlFor="capacity">Capacity & Setup</Label>
          <Input
            id="capacity"
            value={formData.capacity}
            onChange={(e) => setFormData((p) => ({ ...p, capacity: e.target.value }))}
            placeholder="e.g., Boardroom 6-8, 1,000 sqft"
          />
        </div>
        <div>
          <Label htmlFor="venueSpace">Venue Space</Label>
          <Input
            id="venueSpace"
            value={formData.venueSpace}
            onChange={(e) => setFormData((p) => ({ ...p, venueSpace: e.target.value }))}
            placeholder="e.g., Ballroom A"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Adding..." : "Add Space"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditRunOfShowDialog({
  runOfShow,
  onSuccess,
  onClose,
}: {
  runOfShow: RunOfShow;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(runOfShow.name);
  const [startDate, setStartDate] = useState(
    typeof runOfShow.startDate === 'string'
      ? (runOfShow.startDate as string).split('T')[0]
      : new Date(runOfShow.startDate).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    typeof runOfShow.endDate === 'string'
      ? (runOfShow.endDate as string).split('T')[0]
      : new Date(runOfShow.endDate).toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;

    setSaving(true);
    try {
      await updateRunOfShow(runOfShow.id, {
        name,
        startDate: new Date(startDate + "T12:00:00.000Z"),
        endDate: new Date(endDate + "T12:00:00.000Z"),
      });
      onSuccess();
    } catch (error) {
      console.error("Failed to update run of show:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Run of Show</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="edit-name">Name</Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Main Event Space Allocation"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="edit-startDate">Start Date</Label>
            <Input
              id="edit-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit-endDate">End Date</Label>
            <Input
              id="edit-endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
