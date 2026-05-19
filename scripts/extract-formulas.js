const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.resolve(__dirname, '../Budget.xlsx');
const OUTPUT_MD = path.resolve(__dirname, '../formula_inventory.md');
const OUTPUT_JSON = path.resolve(__dirname, '../formula_inventory.json');

async function extractFormulas() {
  console.log(`Reading Excel file: ${EXCEL_FILE}`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE);
  
  const allFormulas = [];
  const patternMap = new Map();
  
  workbook.eachSheet((worksheet, sheetId) => {
    const sheetName = worksheet.name;
    console.log(`Processing sheet: ${sheetName}`);
    
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (cell.formula || cell.sharedFormula) {
          const formula = cell.formula || cell.sharedFormula;
          const cellAddress = cell.address;
          const computedValue = cell.value?.result !== undefined 
            ? cell.value.result 
            : (typeof cell.value === 'object' ? JSON.stringify(cell.value) : cell.value);
          
          const entry = {
            sheet: sheetName,
            cell: cellAddress,
            formula: formula,
            computedValue: computedValue
          };
          allFormulas.push(entry);
          
          const pattern = normalizeFormula(formula);
          if (!patternMap.has(pattern)) {
            patternMap.set(pattern, { count: 0, examples: [], originalFormula: formula });
          }
          const patternEntry = patternMap.get(pattern);
          patternEntry.count++;
          if (patternEntry.examples.length < 3) {
            patternEntry.examples.push(`${sheetName}!${cellAddress}`);
          }
        }
      });
    });
  });
  
  const uniquePatterns = Array.from(patternMap.entries())
    .map(([pattern, data]) => ({
      pattern,
      originalExample: data.originalFormula,
      count: data.count,
      examples: data.examples
    }))
    .sort((a, b) => b.count - a.count);
  
  generateMarkdownReport(workbook, allFormulas, uniquePatterns);
  generateJsonReport(allFormulas, uniquePatterns);
  
  console.log('\n=== SUMMARY ===');
  console.log(`Number of sheets: ${workbook.worksheets.length}`);
  console.log(`Total formula cells found: ${allFormulas.length}`);
  console.log(`Number of unique formula patterns: ${uniquePatterns.length}`);
  console.log(`\nOutput files:`);
  console.log(`  - ${OUTPUT_MD}`);
  console.log(`  - ${OUTPUT_JSON}`);
}

function normalizeFormula(formula) {
  let normalized = formula;
  normalized = normalized.replace(/\$?[A-Z]+\$?\d+/g, (match) => {
    const col = match.replace(/[\$\d]/g, '');
    return `${col}#`;
  });
  normalized = normalized.replace(/\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+/g, (match) => {
    const parts = match.split(':');
    const col1 = parts[0].replace(/[\$\d]/g, '');
    const col2 = parts[1].replace(/[\$\d]/g, '');
    return `${col1}#:${col2}#`;
  });
  return normalized;
}

function generateMarkdownReport(workbook, allFormulas, uniquePatterns) {
  let md = '# Formula Inventory Report\n\n';
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `**Source File:** Budget.xlsx\n\n`;
  md += '---\n\n';
  
  md += '## Summary\n\n';
  md += `- **Sheets:** ${workbook.worksheets.length}\n`;
  md += `- **Total Formula Cells:** ${allFormulas.length}\n`;
  md += `- **Unique Formula Patterns:** ${uniquePatterns.length}\n\n`;
  md += '---\n\n';
  
  md += '## Formula Inventory by Sheet\n\n';
  
  const formulasBySheet = {};
  allFormulas.forEach(f => {
    if (!formulasBySheet[f.sheet]) {
      formulasBySheet[f.sheet] = [];
    }
    formulasBySheet[f.sheet].push(f);
  });
  
  Object.keys(formulasBySheet).forEach(sheetName => {
    const formulas = formulasBySheet[sheetName];
    md += `### Sheet: ${sheetName}\n\n`;
    md += `**Formula count:** ${formulas.length}\n\n`;
    
    if (formulas.length > 0) {
      md += '| Cell | Formula | Computed Value |\n';
      md += '|------|---------|----------------|\n';
      formulas.forEach(f => {
        const escapedFormula = f.formula.replace(/\|/g, '\\|');
        const displayValue = f.computedValue !== undefined && f.computedValue !== null 
          ? String(f.computedValue).substring(0, 50) 
          : 'N/A';
        md += `| ${f.cell} | \`${escapedFormula}\` | ${displayValue} |\n`;
      });
    }
    md += '\n';
  });
  
  md += '---\n\n';
  md += '## Unique Formula Patterns\n\n';
  md += 'Formulas are normalized by replacing cell references with column placeholders.\n\n';
  
  md += '| Pattern | Count | Example Locations |\n';
  md += '|---------|-------|-------------------|\n';
  uniquePatterns.forEach(p => {
    const escapedPattern = p.pattern.replace(/\|/g, '\\|');
    md += `| \`${escapedPattern}\` | ${p.count} | ${p.examples.join(', ')} |\n`;
  });
  
  fs.writeFileSync(OUTPUT_MD, md);
  console.log(`Written: ${OUTPUT_MD}`);
}

function generateJsonReport(allFormulas, uniquePatterns) {
  const jsonData = {
    generatedAt: new Date().toISOString(),
    sourceFile: 'Budget.xlsx',
    summary: {
      totalFormulaCells: allFormulas.length,
      uniquePatterns: uniquePatterns.length
    },
    formulas: allFormulas,
    patterns: uniquePatterns
  };
  
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(jsonData, null, 2));
  console.log(`Written: ${OUTPUT_JSON}`);
}

extractFormulas().catch(err => {
  console.error('Error extracting formulas:', err);
  process.exit(1);
});
