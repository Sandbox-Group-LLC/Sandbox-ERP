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
import { Plus, Trash2, Building2, Download } from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";
import * as XLSX from "xlsx";
import {
  getVenueSearches,
  createVenueSearch,
  deleteVenueSearch,
  addVenueEntry,
  updateVenueEntry,
  deleteVenueEntry,
} from "./actions";
import { useToast } from "@/hooks/use-toast";

type VenueSearchEntry = {
  id: string;
  venueSearchId: string;
  vendorId: string | null;
  vendor: { id: string; name: string } | null;
  brand: string | null;
  state: string | null;
  city: string | null;
  hotelName: string | null;
  starRating: string | null;
  comment: string | null;
  date1Available: string | null;
  date2Available: string | null;
  date3Available: string | null;
  date4Available: string | null;
  date5Available: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  totalSleepingRooms: string | null;
  lastRenovated: string | null;
  rate: string | null;
  resortFee: string | null;
  housekeepingCharge: string | null;
  inRoomWifi: string | null;
  attrition: string | null;
  earnedComps: string | null;
  unionStatus: string | null;
  fbMinimum: string | null;
  functionSpaceRental: string | null;
  cateringMenuDiscount: string | null;
  rebate: string | null;
  exclusiveVendors: string | null;
  avDiscount: string | null;
  parkingFees: string | null;
  siteVisitNights: string | null;
  distanceFromAirport: string | null;
  biggestFunctionRoom: string | null;
  floorPlanLink: string | null;
  capacityChartLink: string | null;
  sortOrder: number;
};

type VenueSearch = {
  id: string;
  projectId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  entries: VenueSearchEntry[];
};

interface VenueSearchTabProps {
  projectId: string;
}

const baseColumns = [
  { key: "brand", label: "Brand", width: "120px", sticky: true, left: "0px" },
  { key: "state", label: "State", width: "80px", sticky: true, left: "120px" },
  { key: "city", label: "City", width: "120px", sticky: true, left: "200px" },
  { key: "hotelName", label: "Hotel Name", width: "180px", sticky: true, left: "320px" },
];

const dateFieldKeys = ["date1Available", "date2Available", "date3Available", "date4Available", "date5Available"];

function generateDateColumns(startDate: Date, endDate: Date) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = differenceInDays(end, start) + 1;
  const numCols = Math.min(totalDays, 5);
  
  const dateColumns = [];
  for (let i = 0; i < numCols; i++) {
    const date = addDays(start, i);
    dateColumns.push({
      key: dateFieldKeys[i],
      label: format(date, "M/d"),
      width: "80px",
    });
  }
  return dateColumns;
}

const trailingColumns = [
  { key: "comment", label: "Comment", width: "150px" },
  { key: "starRating", label: "Star Rating", width: "90px" },
  { key: "contactName", label: "Contact Name", width: "140px" },
  { key: "contactTitle", label: "Title", width: "120px" },
  { key: "contactPhone", label: "Phone", width: "130px" },
  { key: "contactEmail", label: "Email", width: "180px" },
  { key: "totalSleepingRooms", label: "Total Sleeping Rooms", width: "150px" },
  { key: "lastRenovated", label: "Last Renovated", width: "120px" },
  { key: "rate", label: "Rate", width: "100px" },
  { key: "resortFee", label: "Resort Fee", width: "100px" },
  { key: "housekeepingCharge", label: "Housekeeping", width: "120px" },
  { key: "inRoomWifi", label: "In-Room WiFi", width: "110px" },
  { key: "attrition", label: "Attrition", width: "100px" },
  { key: "earnedComps", label: "Earned Comps", width: "120px" },
  { key: "unionStatus", label: "Union", width: "80px" },
  { key: "fbMinimum", label: "F&B Minimum", width: "120px" },
  { key: "functionSpaceRental", label: "Function Space Rental", width: "160px" },
  { key: "cateringMenuDiscount", label: "Catering Menu Discount", width: "170px" },
  { key: "rebate", label: "Rebate", width: "100px" },
  { key: "exclusiveVendors", label: "Exclusive Vendors", width: "140px" },
  { key: "avDiscount", label: "AV Discount", width: "110px" },
  { key: "parkingFees", label: "Parking Fees", width: "110px" },
  { key: "siteVisitNights", label: "Site Visit Nights", width: "130px" },
  { key: "distanceFromAirport", label: "Distance from Airport", width: "160px" },
  { key: "biggestFunctionRoom", label: "Biggest Function Room", width: "170px" },
  { key: "floorPlanLink", label: "Floor Plan Link", width: "130px" },
  { key: "capacityChartLink", label: "Capacity Chart Link", width: "150px" },
];

type ColumnConfig = {
  key: string;
  label: string;
  width: string;
  sticky?: boolean;
  left?: string;
};

export function VenueSearchTab({ projectId }: VenueSearchTabProps) {
  const [venueSearches, setVenueSearches] = useState<VenueSearch[]>([]);
  const [selectedSearch, setSelectedSearch] = useState<VenueSearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      const data = await getVenueSearches(projectId);
      setVenueSearches(data);
      if (data.length > 0 && !selectedSearch) {
        setSelectedSearch(data[0]);
      } else if (selectedSearch) {
        const updated = data.find((r) => r.id === selectedSearch.id);
        setSelectedSearch(updated || null);
      }
    } catch (error) {
      console.error("Failed to load venue searches:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  if (loading) {
    return <div className="text-muted-foreground">Loading venue search...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Venue Search</h2>
          <p className="text-sm text-muted-foreground">
            Compare venues and track availability for your event
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Venue Search
            </Button>
          </DialogTrigger>
          <CreateVenueSearchDialog
            projectId={projectId}
            onSuccess={(vs) => {
              setVenueSearches((prev) => [vs, ...prev]);
              setSelectedSearch(vs);
              setShowCreateDialog(false);
              toast({ title: "Venue Search created" });
            }}
            onClose={() => setShowCreateDialog(false)}
          />
        </Dialog>
      </div>

      {venueSearches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No venue searches yet</p>
            <p className="text-sm text-muted-foreground">
              Create a venue search to start comparing venues
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {venueSearches.map((vs) => (
              <Button
                key={vs.id}
                variant={selectedSearch?.id === vs.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedSearch(vs)}
              >
                {vs.name}
              </Button>
            ))}
          </div>

          {selectedSearch && (
            <VenueSearchGrid
              venueSearch={selectedSearch}
              onRefresh={loadData}
              onDelete={async () => {
                try {
                  await deleteVenueSearch(selectedSearch.id);
                  setVenueSearches((prev) => prev.filter((r) => r.id !== selectedSearch.id));
                  setSelectedSearch(venueSearches.length > 1 ? venueSearches[0] : null);
                  toast({ title: "Venue Search deleted" });
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

function CreateVenueSearchDialog({
  projectId,
  onSuccess,
  onClose,
}: {
  projectId: string;
  onSuccess: (vs: VenueSearch) => void;
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
      const vs = await createVenueSearch({
        projectId,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
      onSuccess(vs as VenueSearch);
    } catch (error) {
      console.error("Failed to create venue search:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create Venue Search</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Q2 Conference Venue Search"
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

function VenueSearchGrid({
  venueSearch,
  onRefresh,
  onDelete,
}: {
  venueSearch: VenueSearch;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [addingRow, setAddingRow] = useState(false);
  const { toast } = useToast();
  
  const dateColumns = generateDateColumns(venueSearch.startDate, venueSearch.endDate);
  const columnConfig: ColumnConfig[] = [...baseColumns, ...dateColumns, ...trailingColumns];

  const handleAddRow = async () => {
    setAddingRow(true);
    try {
      await addVenueEntry(venueSearch.id);
      onRefresh();
      toast({ title: "Row added" });
    } catch (error) {
      toast({ title: "Failed to add row", variant: "destructive" });
    } finally {
      setAddingRow(false);
    }
  };

  const handleDeleteRow = async (entryId: string) => {
    try {
      await deleteVenueEntry(entryId);
      onRefresh();
      toast({ title: "Row deleted" });
    } catch (error) {
      toast({ title: "Failed to delete row", variant: "destructive" });
    }
  };

  const handleExportExcel = () => {
    const rows = venueSearch.entries.map((entry) => {
      const row: Record<string, string> = {};
      columnConfig.forEach((col) => {
        row[col.label] = (entry[col.key as keyof VenueSearchEntry] as string) || "";
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Venue Search");
    
    const fileName = `${venueSearch.name.replace(/[^a-z0-9]/gi, "_")}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    toast({ title: "Excel file downloaded" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{venueSearch.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {format(new Date(venueSearch.startDate), "MMM d, yyyy")} -{" "}
              {format(new Date(venueSearch.endDate), "MMM d, yyyy")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleAddRow} disabled={addingRow}>
              <Plus className="h-4 w-4 mr-2" />
              {addingRow ? "Adding..." : "Add Row"}
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
                {columnConfig.map((col) => (
                  <th
                    key={col.key}
                    className={`border p-2 text-left font-medium whitespace-nowrap ${
                      col.sticky ? "sticky bg-muted z-20" : "bg-muted/50"
                    }`}
                    style={{
                      minWidth: col.width,
                      left: col.sticky ? col.left : undefined,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="border p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(!venueSearch.entries || venueSearch.entries.length === 0) ? (
                <tr>
                  <td
                    colSpan={columnConfig.length + 1}
                    className="border p-8 text-center text-muted-foreground"
                  >
                    No venues added yet. Click "Add Row" to add a venue.
                  </td>
                </tr>
              ) : (
                venueSearch.entries.map((entry) => (
                  <VenueEntryRow
                    key={entry.id}
                    entry={entry}
                    columnConfig={columnConfig}
                    onRefresh={onRefresh}
                    onDelete={() => handleDeleteRow(entry.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function VenueEntryRow({
  entry,
  columnConfig,
  onRefresh,
  onDelete,
}: {
  entry: VenueSearchEntry;
  columnConfig: ColumnConfig[];
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  const handleCellClick = (field: string, value: string | null) => {
    setEditingField(field);
    setEditValue(value || "");
  };

  const handleSave = async () => {
    if (!editingField) return;

    try {
      await updateVenueEntry(entry.id, {
        [editingField]: editValue || null,
      });
      onRefresh();
      setEditingField(null);
    } catch (error) {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditingField(null);
    }
  };

  const renderCell = (col: ColumnConfig) => {
    const value = entry[col.key as keyof VenueSearchEntry] as string | null;
    const isEditing = editingField === col.key;

    if (isEditing) {
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="h-7 text-xs"
        />
      );
    }

    return (
      <div
        className="cursor-pointer hover:text-primary min-h-[28px] flex items-center"
        onClick={() => handleCellClick(col.key, value)}
      >
        {value || <span className="text-muted-foreground italic text-xs">-</span>}
      </div>
    );
  };

  return (
    <tr className="hover:bg-muted/30 group">
      {columnConfig.map((col) => (
        <td
          key={col.key}
          className={`border p-1 ${col.sticky ? "sticky bg-background group-hover:bg-muted/30 z-20" : ""}`}
          style={{
            minWidth: col.width,
            left: col.sticky ? col.left : undefined,
          }}
        >
          {renderCell(col)}
        </td>
      ))}
      <td className="border p-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
