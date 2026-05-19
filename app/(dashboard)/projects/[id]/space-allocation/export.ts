"use client";

import ExcelJS from "exceljs";
import { format, eachDayOfInterval, startOfDay } from "date-fns";

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

export async function exportRunOfShowToExcel(
  runOfShow: RunOfShow,
  projectName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(runOfShow.name.slice(0, 31));

  const dates = eachDayOfInterval({
    start: new Date(runOfShow.startDate),
    end: new Date(runOfShow.endDate),
  });

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Function", key: "function", width: 25 },
    { header: "Capacity & Setup", key: "capacity", width: 20 },
    { header: "Venue Space", key: "venueSpace", width: 20 },
  ];

  dates.forEach((date, index) => {
    columns.push({
      header: `${format(date, "EEEE")}\n${format(date, "MMM d, yyyy")}`,
      key: `day_${index}`,
      width: 25,
    });
  });

  worksheet.columns = columns as Partial<ExcelJS.Column>[];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4A5568" },
  };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = 40;

  const getCellContent = (space: RunOfShowSpace, date: Date): string => {
    const dateStart = startOfDay(date);
    
    const cell = space.cells.find((c) => {
      const cellDate = startOfDay(new Date(c.date));
      return cellDate.getTime() === dateStart.getTime();
    });
    return cell?.content || "";
  };

  if (runOfShow.spaces && runOfShow.spaces.length > 0) {
    runOfShow.spaces.forEach((space, rowIndex) => {
      const rowData: Record<string, string> = {
        function: space.function || "",
        capacity: space.capacity || "",
        venueSpace: space.venueSpace || "",
      };

      dates.forEach((date, dateIndex) => {
        rowData[`day_${dateIndex}`] = getCellContent(space, date);
      });

      const row = worksheet.addRow(rowData);
      row.alignment = { vertical: "top", wrapText: true };
      row.height = 60;

      if (rowIndex % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF7FAFC" },
        };
      }
    });
  }

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  for (let i = 1; i <= 3; i++) {
    const col = worksheet.getColumn(i);
    col.eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEDF2F7" },
        };
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const sanitizedProjectName = projectName.replace(/[^a-zA-Z0-9]/g, "_");
  const sanitizedRosName = runOfShow.name.replace(/[^a-zA-Z0-9]/g, "_");
  link.download = `${sanitizedProjectName}_${sanitizedRosName}_Space_Allocation.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
