"use client";

import ExcelJS from "exceljs";
import { ClientBudgetData, ClientBudgetCategory, ClientBudgetVersionData } from "./actions";

interface BudgetSheetData {
  categories: ClientBudgetCategory[];
  taxAmount: number;
  grandTotal: number;
}

function addBudgetDataToWorksheet(worksheet: ExcelJS.Worksheet, data: BudgetSheetData) {
  worksheet.columns = [
    { header: "DESCRIPTION", key: "description", width: 50 },
    { header: "PARTY", key: "party", width: 15 },
    { header: "RATE", key: "rate", width: 12 },
    { header: "HOURS", key: "hours", width: 10 },
    { header: "TOTAL", key: "total", width: 15 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
  headerRow.alignment = { horizontal: "left" };
  worksheet.getCell("C1").alignment = { horizontal: "right" };
  worksheet.getCell("D1").alignment = { horizontal: "right" };
  worksheet.getCell("E1").alignment = { horizontal: "right" };

  let currentRow = 2;

  for (const category of data.categories) {
    const catRow = worksheet.getRow(currentRow);
    worksheet.mergeCells(currentRow, 1, currentRow, 5);
    catRow.getCell(1).value = category.name.toUpperCase();
    catRow.font = { bold: true };
    catRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD0D0D0" },
    };
    currentRow++;

    for (const line of category.lines) {
      const lineRow = worksheet.getRow(currentRow);
      lineRow.getCell(1).value = line.description;
      lineRow.getCell(2).value = line.party;
      lineRow.getCell(3).value = line.rate !== null ? line.rate : "N/A";
      lineRow.getCell(4).value = line.hours !== null ? line.hours : "N/A";
      lineRow.getCell(5).value = line.total;
      
      if (line.rate !== null) {
        lineRow.getCell(3).numFmt = "$#,##0";
      }
      lineRow.getCell(5).numFmt = "$#,##0";
      
      lineRow.getCell(3).alignment = { horizontal: "right" };
      lineRow.getCell(4).alignment = { horizontal: "right" };
      lineRow.getCell(5).alignment = { horizontal: "right" };
      
      currentRow++;
    }

    const subtotalRow = worksheet.getRow(currentRow);
    subtotalRow.getCell(4).value = "Subtotal";
    subtotalRow.getCell(5).value = category.subtotal;
    subtotalRow.getCell(4).font = { bold: true };
    subtotalRow.getCell(5).font = { bold: true };
    subtotalRow.getCell(5).numFmt = "$#,##0";
    subtotalRow.getCell(4).alignment = { horizontal: "right" };
    subtotalRow.getCell(5).alignment = { horizontal: "right" };
    currentRow++;
  }

  if (data.taxAmount > 0) {
    const taxHeaderRow = worksheet.getRow(currentRow);
    worksheet.mergeCells(currentRow, 1, currentRow, 5);
    taxHeaderRow.getCell(1).value = "TAX";
    taxHeaderRow.font = { bold: true };
    taxHeaderRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD0D0D0" },
    };
    currentRow++;

    const taxRow = worksheet.getRow(currentRow);
    taxRow.getCell(4).value = "Estimated";
    taxRow.getCell(5).value = data.taxAmount;
    taxRow.getCell(5).numFmt = "$#,##0";
    taxRow.getCell(4).alignment = { horizontal: "right" };
    taxRow.getCell(5).alignment = { horizontal: "right" };
    currentRow++;
  }

  const grandTotalRow = worksheet.getRow(currentRow);
  grandTotalRow.getCell(1).value = "GRAND TOTAL";
  grandTotalRow.getCell(5).value = data.grandTotal;
  grandTotalRow.font = { bold: true, size: 12 };
  grandTotalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFCC00" },
  };
  grandTotalRow.getCell(5).numFmt = "$#,##0";
  grandTotalRow.getCell(5).alignment = { horizontal: "right" };
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, "").substring(0, 31);
}

export async function exportClientBudgetToExcel(
  data: ClientBudgetData,
  versions?: ClientBudgetVersionData[]
) {
  const workbook = new ExcelJS.Workbook();
  
  const currentSheet = workbook.addWorksheet("Current Budget");
  addBudgetDataToWorksheet(currentSheet, {
    categories: data.categories,
    taxAmount: data.taxAmount,
    grandTotal: data.grandTotal,
  });

  if (versions && versions.length > 0) {
    for (const version of versions) {
      const sheetName = sanitizeSheetName(`v${version.versionNumber} - ${version.title}`);
      const versionSheet = workbook.addWorksheet(sheetName);
      addBudgetDataToWorksheet(versionSheet, {
        categories: version.categories,
        taxAmount: version.taxAmount,
        grandTotal: version.grandTotal,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  
  const sanitizedName = data.projectName.replace(/[^a-zA-Z0-9]/g, "_");
  link.download = `${sanitizedName}_Client_Budget.xlsx`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
