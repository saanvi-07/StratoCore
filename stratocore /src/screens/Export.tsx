import React, { useState } from 'react';
import { Button } from '../components/Button';
import { HardDrive, Folder, Mail, FileText, Table, Brain, ExternalLink, Calendar, RefreshCw, Copy, Check, Download, Layers, Zap } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '../lib/AuthContext';
import { useLocation } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { DISH_BASE_KG_PER_PERSON, REFERENCE_CYLINDER_KG, getDishProfileForState, predictLpg, predictElectricity } from '../lib/excelEngine';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function Export() {
  const { user } = useAuth();
  const [exportingTo, setExportingTo] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string | null>(null);
  const [copiedCsv, setCopiedCsv] = useState(false);
  const [activeTab, setActiveTab] = useState<'compact' | 'matrix' | 'summary' | 'separate'>('compact');

  // Google Drive folder link states
  const [driveFolderLink, setDriveFolderLink] = useState<string>(() => localStorage.getItem('google_drive_folder_link') || '');
  const [folderModalOpen, setFolderModalOpen] = useState<boolean>(false);
  const [folderInputTemp, setFolderInputTemp] = useState<string>('');

  const extractDriveFolderId = (urlOrId: string): string | null => {
    if (!urlOrId || !urlOrId.trim()) return null;
    const str = urlOrId.trim();
    const folderMatch = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    const idMatch = str.match(/id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{15,}$/.test(str)) return str;
    return null;
  };

  const location = useLocation();
  const state = location.state as { calculationResult?: any; type?: string } | null;

  const initialResult = state?.calculationResult;
  const isLPG = state?.type === 'lpg' || Boolean(initialResult?.inputs?.kgPerCylinder);

  // Dynamic input controls for instant on-screen recalculation
  const [inputKg, setInputKg] = useState<number>(initialResult?.inputs?.kgPerCylinder || 14.2);
  const [inputPrice, setInputPrice] = useState<number>(initialResult?.inputs?.pricePaid || 942);
  const [inputFamilyMembers, setInputFamilyMembers] = useState<number>(initialResult?.inputs?.familyMembers || 5);
  const [inputSeparateUsers, setInputSeparateUsers] = useState<number>(initialResult?.inputs?.separateCylinderUsers || 0);
  const [selectedYears, setSelectedYears] = useState<number>(initialResult?.inputs?.predictionYears || 1);

  // Dynamic input controls for Electricity
  const [inputBill, setInputBill] = useState<number>(initialResult?.inputs?.normalBill || 6000);
  const [inputUnits, setInputUnits] = useState<number>(initialResult?.inputs?.totalUnits || 800);
  const [inputRate, setInputRate] = useState<number>(initialResult?.inputs?.ratePerUnit || 7.5);

  // Recompute active calculation result
  const currentResult = isLPG ? predictLpg({
    kgPerCylinder: inputKg > 0 ? inputKg : 14.2,
    cylindersBought: initialResult?.inputs?.cylindersBought || 1,
    pricePaid: inputPrice > 0 ? inputPrice : 942,
    familyMembers: inputFamilyMembers > 0 ? inputFamilyMembers : 1,
    separateCylinderUsers: inputSeparateUsers >= 0 ? inputSeparateUsers : 0,
    daysPerCylinder: initialResult?.inputs?.daysPerCylinder,
    predictionYears: selectedYears,
    wantSeparatePrediction: initialResult?.inputs?.wantSeparatePrediction || inputSeparateUsers > 0,
  }) : predictElectricity({
    normalBill: inputBill > 0 ? inputBill : 6000,
    unpaidBillAmount: initialResult?.inputs?.unpaidBillAmount || 0,
    predictionYears: selectedYears,
    totalUnits: inputUnits > 0 ? inputUnits : 800,
    billingDays: initialResult?.inputs?.billingDays || 30,
    ratePerUnit: inputRate > 0 ? inputRate : 7.5,
    customAppliances: initialResult?.inputs?.customAppliances || initialResult?.appliance_breakdown,
    uploadedFileName: initialResult?.inputs?.uploadedFileName || 'Recent_Bill.pdf',
  });

  const lpgResult = isLPG ? (currentResult as any) : null;
  const electricityResult = !isLPG ? (currentResult as any) : null;

  const handleYearsChange = (years: number) => {
    setSelectedYears(years);
  };

  const handleAnalyze = async () => {
    if (!currentResult) return;
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: isLPG ? 'lpg' : 'electricity', result: currentResult } }),
      });
      if (!response.ok) throw new Error('Analysis failed');
      const json = await response.json();
      setAiAnalysis(json.analysis);
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Failed to generate AI analysis.', type: 'error' });
    } finally {
      setAnalyzing(false);
    }
  };

  const getColLetter = (colIndex: number): string => {
    let letter = '';
    let curr = colIndex;
    while (curr > 0) {
      const mod = (curr - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      curr = Math.floor((curr - mod - 1) / 26);
    }
    return letter;
  };

  const dishItems = getDishProfileForState((user as any)?.state);
  const effectiveMembers = Math.max(1, inputFamilyMembers - inputSeparateUsers);
  const costPerKg = inputKg > 0 ? inputPrice / inputKg : 0;

  // Build workbook formatted matching user's exact HTML tables
  const buildExcelWorkbookBuffer = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Forecast App';

    if (isLPG && currentResult) {
      // SHEET 1: Compact Dish Breakdown & LPG Parameters (Matching HTML Table 1)
      const wsCompact = workbook.addWorksheet('Dish Breakdown & Parameters');
      wsCompact.columns = [
        { header: '', key: 'index', width: 8 },
        { header: '', key: 'dish', width: 25 },
        { header: '', key: 'degree', width: 22 },
        { header: '', key: 'gasKg', width: 22 },
        { header: '', key: 'dailyCost', width: 20 },
        { header: '', key: 'spacer', width: 5 },
        { header: '', key: 'paramName', width: 22 },
        { header: '', key: 'paramVal', width: 18 },
      ];

      // Table 1 Headers
      const cTitle = wsCompact.addRow(['#', 'Dishes', 'Average Degree Required', 'Average Gas Kg Used', 'Daily Cost (Loss)', '', 'LPG Parameters', 'Value']);
      cTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cTitle.eachCell((cell, colNum) => {
        if (colNum <= 5) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } };
        } else if (colNum >= 7) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF205086' } };
        }
      });

      // Rows for dishes + LPG Parameters in cols G:H
      dishItems.forEach((item, idx) => {
        const rIdx = idx + 2;
        const gasKgVal = item.baseKg * effectiveMembers * (inputKg / 27.8);
        const dailyCostVal = gasKgVal * costPerKg;

        const rowData: any[] = [
          idx + 1,
          item.dish,
          item.degree,
          { formula: `${item.baseKg}*${effectiveMembers}*(H3/27.8)`, result: Number(gasKgVal.toFixed(4)) },
          { formula: `D${rIdx}*(H2/H3)`, result: Number(dailyCostVal.toFixed(2)) },
          '',
        ];

        if (idx === 0) {
          rowData.push('Cylinder Price (₹)', inputPrice);
        } else if (idx === 1) {
          rowData.push('Kg per Cylinder', inputKg);
        } else if (idx === 2) {
          rowData.push('Family Members', inputFamilyMembers);
        } else if (idx === 3) {
          rowData.push('Prediction Years', selectedYears);
        } else {
          rowData.push('', '');
        }

        wsCompact.addRow(rowData);
      });

      // Total row
      const endDishRow = dishItems.length + 1;
      const totRow = wsCompact.addRow([
        '',
        'Total',
        '',
        { formula: `SUM(D2:D${endDishRow})`, result: Number((Object.values(DISH_BASE_KG_PER_PERSON).reduce((a, b) => a + b, 0) * effectiveMembers * (inputKg / 27.8)).toFixed(4)) },
        { formula: `SUM(E2:E${endDishRow})`, result: Number((Object.values(DISH_BASE_KG_PER_PERSON).reduce((a, b) => a + b, 0) * effectiveMembers * (inputKg / 27.8) * costPerKg).toFixed(2)) },
        '', '', ''
      ]);
      totRow.font = { bold: true };

      wsCompact.eachRow((row) => {
        row.eachCell((cell, colNum) => {
          if (colNum <= 5 || (colNum >= 7 && cell.value !== '')) {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
              left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
              bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
              right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
            };
          }
        });
      });

      // SHEET 2: Wide Format Matrix Across Family Members 1..9 (Matching HTML Table 2)
      const wsWide = workbook.addWorksheet('Dish Breakdown (Wide)');
      const userStateName = (user as any)?.state || 'Standard';

      const wTitle = wsWide.addRow([`LPG Dish Breakdown & Household Scaling Matrix (${userStateName} Profile)`]);
      wTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      wTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };

      wsWide.addRow(['KG per Cylinder', inputKg]); // B2
      wsWide.addRow(['Price Paid (₹)', inputPrice]); // B3
      wsWide.addRow(['Cost per KG (₹)', { formula: 'IF(B2>0, B3/B2, 0)', result: costPerKg }]); // B4
      wsWide.addRow(['Prediction Years', selectedYears]); // B5
      wsWide.addRow([]); // Row 6

      const headerRow1Vals: string[] = ['Dishes', 'Average Degree Required'];
      const headerRow2Vals: string[] = ['', ''];

      for (let m = 1; m <= 9; m++) {
        headerRow1Vals.push(`Family Member ${m}`, '', '', '');
        headerRow2Vals.push('Average Gas Kg Used', 'Daily Cost (Loss)', 'Lifespan (Months)', `Loss (${selectedYears} Yr${selectedYears > 1 ? 's' : ''})`);
      }

      const hRow1 = wsWide.addRow(headerRow1Vals); // Row 7
      hRow1.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hRow1.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
      });

      for (let m = 1; m <= 9; m++) {
        const startCol = 3 + (m - 1) * 4;
        const endCol = startCol + 3;
        wsWide.mergeCells(`${getColLetter(startCol)}7:${getColLetter(endCol)}7`);
      }

      const hRow2 = wsWide.addRow(headerRow2Vals); // Row 8
      hRow2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hRow2.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } };
      });

      const startDishRow = 9;
      dishItems.forEach((item, idx) => {
        const rIdx = startDishRow + idx;
        const rowVals: any[] = [item.dish, item.degree];

        for (let m = 1; m <= 9; m++) {
          const kgColLetter = getColLetter(3 + (m - 1) * 4);
          const costColLetter = getColLetter(4 + (m - 1) * 4);

          const avgKgVal = item.baseKg * m * (inputKg / 27.8);
          const avgKgFormula = `${item.baseKg}*${m}*(B2/27.8)`;

          const dailyCostVal = avgKgVal * costPerKg;
          const dailyCostFormula = `${kgColLetter}${rIdx}*B4`;

          const lifespanMonths = inputKg / (avgKgVal * 30);
          const lifespanFormula = `IF(${kgColLetter}${rIdx}>0, B2/(${kgColLetter}${rIdx}*30), 0)`;

          const lossInYearVal = dailyCostVal * 365 * selectedYears;
          const lossInYearFormula = `${costColLetter}${rIdx}*365*B5`;

          rowVals.push(
            { formula: avgKgFormula, result: Number(avgKgVal.toFixed(4)) },
            { formula: dailyCostFormula, result: Number(dailyCostVal.toFixed(2)) },
            { formula: lifespanFormula, result: Number(lifespanMonths.toFixed(2)) },
            { formula: lossInYearFormula, result: Number(lossInYearVal.toFixed(2)) }
          );
        }

        wsWide.addRow(rowVals);
      });

      wsWide.columns.forEach((col, cIdx) => {
        col.width = cIdx < 2 ? 22 : 18;
      });

      wsWide.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
          };
        });
      });

      // SHEET 3: Forecast Summary (Vertical Report)
      const wsSum = workbook.addWorksheet('Forecast Summary');
      wsSum.columns = [
        { header: '', key: 'metric', width: 45 },
        { header: '', key: 'value', width: 25 },
      ];

      const titleRow = wsSum.addRow(['LPG Forecast Report']);
      titleRow.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
      wsSum.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
      wsSum.addRow([]);

      const addHeader = (title: string) => {
        const row = wsSum.addRow([title, 'Value']);
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        return row;
      };

      addHeader('Inputs');
      wsSum.addRow(['KG per Cylinder', inputKg]);
      wsSum.addRow(['Price Paid (₹)', inputPrice]);
      wsSum.addRow(['Family Members', inputFamilyMembers]);
      wsSum.addRow(['Separate Cylinder Users', inputSeparateUsers]);
      wsSum.addRow(['Prediction Years', selectedYears]);

      wsSum.addRow([]);
      addHeader('Modeled Usage Summary');
      wsSum.addRow(['Modeled Daily KG', { formula: `'Dish Breakdown & Parameters'!D${endDishRow + 1}`, result: lpgResult.modeled.daily_kg }]);
      wsSum.addRow(['Modeled Daily Cost (₹)', { formula: `'Dish Breakdown & Parameters'!E${endDishRow + 1}`, result: lpgResult.modeled.daily_loss }]);
      wsSum.addRow(['Modeled 1 Year Cost (₹)', { formula: 'B10*365', result: lpgResult.modeled.projected_1_year_loss }]);
      wsSum.addRow([`Modeled ${selectedYears}-Year Cost (₹)`, { formula: 'B11*B6', result: lpgResult.modeled.multi_year_projection }]);

      // SHEET 4: Separate Cylinder Prediction (if applicable)
      if (lpgResult.separate_prediction) {
        const wsSep = workbook.addWorksheet('Separate LPG Prediction');
        wsSep.columns = [
          { header: '', key: 'metric', width: 45 },
          { header: '', key: 'value', width: 25 },
        ];

        const sTitle = wsSep.addRow([`Separate Cylinder Users LPG Prediction (${lpgResult.separate_prediction.members} Member(s))`]);
        sTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        sTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F497D' } };
        wsSep.mergeCells(`A${sTitle.number}:B${sTitle.number}`);
        wsSep.addRow([]);

        wsSep.addRow(['Separate Cylinder Members', lpgResult.separate_prediction.members]);
        wsSep.addRow(['KG per Cylinder', inputKg]);
        wsSep.addRow(['Price Paid (₹)', inputPrice]);
        wsSep.addRow(['Cost per KG (₹)', costPerKg]);
        wsSep.addRow(['Prediction Years', selectedYears]);
        wsSep.addRow([]);

        wsSep.addRow(['Modeled Daily LPG Usage (KG)', lpgResult.separate_prediction.daily_kg]);
        wsSep.addRow(['Modeled Daily Cost (₹)', lpgResult.separate_prediction.daily_loss]);
        wsSep.addRow(['Cylinder Lifespan (Days per Cylinder)', lpgResult.separate_prediction.days_per_cylinder]);
        wsSep.addRow(['Cylinders Needed per Year', lpgResult.separate_prediction.cylinders_per_year]);
        wsSep.addRow(['1 Year Projected Cost (₹)', lpgResult.separate_prediction.projected_1_year_loss]);
        wsSep.addRow([`${selectedYears}-Year Projected Cost (₹)`, lpgResult.separate_prediction.multi_year_projection]);
      }

    } else if (electricityResult) {
      // Electricity Wide Format Excel Workbook
      // SHEET 1: Appliance Breakdown & Parameters
      const wsElecCompact = workbook.addWorksheet('Appliance Breakdown & Params');
      wsElecCompact.columns = [
        { header: '', key: 'index', width: 8 },
        { header: '', key: 'appliance', width: 32 },
        { header: '', key: 'rating', width: 18 },
        { header: '', key: 'dailyUnits', width: 20 },
        { header: '', key: 'dailyCost', width: 20 },
        { header: '', key: 'spacer', width: 5 },
        { header: '', key: 'paramName', width: 25 },
        { header: '', key: 'paramVal', width: 20 },
      ];

      const eTitle = wsElecCompact.addRow(['#', 'Appliance & Power Load', 'Power Rating', 'Daily Units (kWh)', 'Daily Cost (Loss ₹)', '', 'Electricity Parameters', 'Value']);
      eTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      eTitle.eachCell((cell, colNum) => {
        if (colNum <= 5) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        } else if (colNum >= 7) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        }
      });

      const apps = electricityResult.appliance_breakdown || [];
      apps.forEach((item: any, idx: number) => {
        const rowData: any[] = [
          idx + 1,
          item.appliance,
          item.powerRating,
          item.dailyUnits,
          item.dailyCost,
          '',
          '',
          ''
        ];

        if (idx === 0) { rowData[6] = 'Normal Monthly Bill'; rowData[7] = `₹${inputBill}`; }
        else if (idx === 1) { rowData[6] = 'Total Consumed Units'; rowData[7] = `${inputUnits} kWh`; }
        else if (idx === 2) { rowData[6] = 'Rate per kWh Unit'; rowData[7] = `₹${inputRate.toFixed(2)}`; }
        else if (idx === 3) { rowData[6] = 'Billing Period'; rowData[7] = '30 Days'; }
        else if (idx === 4) { rowData[6] = 'Prediction Horizon'; rowData[7] = `${selectedYears} Year(s)`; }
        else if (idx === 5) { rowData[6] = 'Uploaded Bill File'; rowData[7] = electricityResult.inputs?.uploadedFileName || 'Recent_Bill.pdf'; }

        const row = wsElecCompact.addRow(rowData);

        if (idx % 2 === 1) {
          row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        }

        if (idx <= 5) {
          row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          row.getCell(7).font = { bold: true };
          row.getCell(8).font = { bold: true, color: { argb: 'FF1E40AF' } };
        }
      });

      const totalRowE = wsElecCompact.addRow([
        'Total', '', '',
        `=SUM(D2:D${apps.length + 1})`,
        `=SUM(E2:E${apps.length + 1})`,
        '', '', ''
      ]);
      wsElecCompact.mergeCells(`A${apps.length + 2}:C${apps.length + 2}`);
      totalRowE.font = { bold: true };
      totalRowE.getCell(1).alignment = { horizontal: 'right' };
      totalRowE.getCell(4).font = { color: { argb: 'FF1D4ED8' }, bold: true };
      totalRowE.getCell(5).font = { color: { argb: 'FF047857' }, bold: true };

      // SHEET 2: Household / Room Matrix (1 to 9)
      const wsElecMatrix = workbook.addWorksheet('Household Matrix (1 to 9)');
      const mColsE: any[] = [
        { header: '', key: 'appliance', width: 30 },
        { header: '', key: 'rating', width: 18 },
      ];
      for (let m = 1; m <= 9; m++) {
        mColsE.push({ header: '', key: `m${m}_units`, width: 16 });
        mColsE.push({ header: '', key: `m${m}_cost`, width: 16 });
        mColsE.push({ header: '', key: `m${m}_hours`, width: 16 });
        mColsE.push({ header: '', key: `m${m}_loss`, width: 18 });
      }
      wsElecMatrix.columns = mColsE;

      const mHead1E: string[] = ['Appliance', 'Power Rating'];
      for (let m = 1; m <= 9; m++) {
        mHead1E.push(`Household / Room ${m}`, '', '', '');
      }
      const r1E = wsElecMatrix.addRow(mHead1E);
      r1E.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      const mHead2E: string[] = ['', ''];
      for (let m = 1; m <= 9; m++) {
        mHead2E.push('kWh Units/Day', 'Daily Cost (₹)', 'Est Hours', `Loss (${selectedYears} Yrs ₹)`);
      }
      const r2E = wsElecMatrix.addRow(mHead2E);
      r2E.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      r1E.eachCell((cell, colNum) => {
        if (colNum <= 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        else cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      });
      r2E.eachCell((cell, colNum) => {
        if (colNum <= 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        else cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      });

      apps.forEach((item: any, idx: number) => {
        const mRowData: any[] = [item.appliance, item.powerRating];
        for (let m = 1; m <= 9; m++) {
          const u = item.dailyUnits * m;
          const c = item.dailyCost * m;
          const h = (item.sharePercent * 0.24 * m);
          const l = item.yrLoss * m;
          mRowData.push(Number(u.toFixed(3)), Number(c.toFixed(2)), `${h.toFixed(1)} hrs`, Number(l.toFixed(2)));
        }
        const row = wsElecMatrix.addRow(mRowData);
        if (idx % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          });
        }
      });

      // SHEET 3: Electricity Forecast Summary
      const wsElecSum = workbook.addWorksheet('Forecast Summary');
      wsElecSum.columns = [
        { header: '', key: 'metric', width: 45 },
        { header: '', key: 'value', width: 25 },
      ];

      const titleRow = wsElecSum.addRow(['Electricity Forecast Report']);
      titleRow.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      wsElecSum.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
      wsElecSum.addRow([]);

      wsElecSum.addRow(['Normal Monthly Bill (₹)', inputBill]);
      wsElecSum.addRow(['Total Consumed Units (kWh)', inputUnits]);
      wsElecSum.addRow(['Tariff Rate (₹/kWh)', inputRate]);
      wsElecSum.addRow(['Unpaid Bill Balance (₹)', electricityResult.inputs.unpaidBillAmount || 0]);
      wsElecSum.addRow(['Prediction Horizon (Years)', selectedYears]);
      wsElecSum.addRow(['Uploaded Bill Document', electricityResult.inputs.uploadedFileName || 'Recent_Bill.pdf']);
      wsElecSum.addRow([]);

      wsElecSum.addRow(['Daily Cost / Loss (₹)', electricityResult.daily_loss]);
      wsElecSum.addRow(['1 Year Projected Cost (₹)', electricityResult.projected_1_year_loss]);
      wsElecSum.addRow([`${selectedYears}-Year Projection (+Unpaid) (₹)`, electricityResult.multi_year_projection]);
    }

    return await workbook.xlsx.writeBuffer();
  };

  const generateCSVString = () => {
    let csv = '';
    if (isLPG) {
      csv += '=== DISH BREAKDOWN & LPG PARAMETERS ===\n';
      csv += '#,Dishes,Average Degree Required,Average Gas Kg Used,Daily Cost (Loss),,LPG Parameters,Value\n';
      let totalKg = 0;
      let totalCost = 0;
      dishItems.forEach((item, idx) => {
        const dKg = item.baseKg * effectiveMembers * (inputKg / 27.8);
        const dCost = dKg * costPerKg;
        totalKg += dKg;
        totalCost += dCost;
        let pName = '';
        let pVal = '';
        if (idx === 0) { pName = 'Cylinder Price (INR)'; pVal = `${inputPrice}`; }
        if (idx === 1) { pName = 'Kg per Cylinder'; pVal = `${inputKg}`; }
        if (idx === 2) { pName = 'Family Members'; pVal = `${inputFamilyMembers}`; }
        if (idx === 3) { pName = 'Prediction Years'; pVal = `${selectedYears}`; }

        csv += `${idx + 1},"${item.dish}","${item.degree}",${dKg.toFixed(4)},INR ${dCost.toFixed(2)},,"${pName}",${pVal}\n`;
      });
      csv += `,,Total,${totalKg.toFixed(4)},INR ${totalCost.toFixed(2)},,,\n\n`;

      csv += '=== HOUSEHOLD MATRIX (FAMILY MEMBERS 1 TO 9) ===\n';
      let h1 = 'Dishes,Average Degree Required';
      let h2 = ',';
      for (let m = 1; m <= 9; m++) {
        h1 += `,Family Member ${m},,,`;
        h2 += `,Average Gas Kg Used,Daily Cost (Loss),Lifespan (Months),Loss (${selectedYears} Yrs)`;
      }
      csv += `${h1}\n${h2}\n`;

      dishItems.forEach((item) => {
        let row = `"${item.dish}","${item.degree}"`;
        for (let m = 1; m <= 9; m++) {
          const avgKg = item.baseKg * m * (inputKg / 27.8);
          const dailyCost = avgKg * costPerKg;
          const lifespanM = inputKg / (avgKg * 30);
          const yrLoss = dailyCost * 365 * selectedYears;
          row += `,${avgKg.toFixed(4)},INR ${dailyCost.toFixed(2)},${lifespanM.toFixed(2)},INR ${yrLoss.toFixed(2)}`;
        }
        csv += `${row}\n`;
      });
    } else if (electricityResult) {
      csv += 'Electricity Forecast Report\n';
      csv += `Normal Monthly Bill,INR ${electricityResult.inputs.normalBill}\n`;
      csv += `Unpaid Bill Amount,INR ${electricityResult.inputs.unpaidBillAmount || 0}\n`;
      csv += `Prediction Years,${selectedYears}\n`;
      csv += `Daily Loss,INR ${electricityResult.daily_loss}\n`;
      csv += `1 Year Projection,INR ${electricityResult.projected_1_year_loss}\n`;
      csv += `${selectedYears}-Year Projection,INR ${electricityResult.multi_year_projection}\n`;
    }
    return csv;
  };

  const handleCopyCSV = () => {
    const csvData = generateCSVString();
    navigator.clipboard.writeText(csvData);
    setCopiedCsv(true);
    setTimeout(() => setCopiedCsv(false), 2500);
  };

  const handleDownloadCSV = () => {
    const csvData = generateCSVString();
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${isLPG ? 'LPG' : 'Electricity'}_${selectedYears}Yr_Forecast.csv`);
  };

  const uploadToGoogleSheetsAPI = async (buffer: ArrayBuffer, token: string, fileName: string, folderId?: string | null) => {
    const metadata: any = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.spreadsheet'
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google API upload failed: ${errText}`);
    }

    const json = await res.json();
    const sheetEditUrl = `https://docs.google.com/spreadsheets/d/${json.id}/edit`;
    return { sheetEditUrl, fileId: json.id };
  };

  const handleSaveToGoogleDrive = async (overrideFolderLink?: string) => {
    const actionTarget = overrideFolderLink !== undefined || driveFolderLink ? 'Folder' : 'Google Drive';
    setExportingTo(actionTarget);
    setMessage(null);
    setGoogleSheetUrl(null);

    if (!currentResult) {
      setMessage({ text: "No prediction data available to save.", type: 'error' });
      setExportingTo(null);
      return;
    }

    const folderLinkToUse = overrideFolderLink !== undefined ? overrideFolderLink : driveFolderLink;
    const folderId = extractDriveFolderId(folderLinkToUse);

    try {
      const buffer = await buildExcelWorkbookBuffer();
      const fileName = `${isLPG ? 'LPG' : 'Electricity'}_${selectedYears}Yr_Forecast.xlsx`;

      let token = localStorage.getItem('google_oauth_token');

      if (!token) {
        try {
          const authResult = await signInWithPopup(auth, googleProvider);
          const credential = GoogleAuthProvider.credentialFromResult(authResult);
          token = credential?.accessToken || null;
          if (token) {
            localStorage.setItem('google_oauth_token', token);
          }
        } catch (authErr: any) {
          console.warn("Google Auth popup cancelled or failed:", authErr);
        }
      }

      if (token) {
        try {
          const { sheetEditUrl } = await uploadToGoogleSheetsAPI(buffer, token, fileName, folderId);
          setGoogleSheetUrl(sheetEditUrl);
          const folderNote = folderId ? " in your specified Google Drive folder" : "";
          setMessage({
            text: `Successfully saved & converted to Google Sheets${folderNote}! Click 'Open in Google Sheets' below to view and edit.`,
            type: 'success'
          });
          if (folderLinkToUse) {
            localStorage.setItem('google_drive_folder_link', folderLinkToUse);
          }
          setExportingTo(null);
          return;
        } catch (apiErr: any) {
          console.warn("Token expired or Drive upload failed:", apiErr);
          setMessage({
            text: "Failed to upload to Google Drive. Please check your Google permissions or folder link.",
            type: 'error'
          });
          setExportingTo(null);
          return;
        }
      }

      setMessage({
        text: "Google Sign-In required to save directly to Google Drive. Please sign in.",
        type: 'error'
      });
    } catch (err: any) {
      console.error(err);
      setMessage({ text: "Failed to save to Google Drive.", type: 'error' });
    } finally {
      setExportingTo(null);
    }
  };

  const handleSyncToGoogleSheets = async () => {
    return handleSaveToGoogleDrive();
  };

  const handleGmailExport = async () => {
    setExportingTo('Gmail');
    setMessage(null);

    const userEmail = user?.email || '';
    const subject = `LPG & Electricity Forecast Report (${selectedYears} Year Prediction)`;

    let body = `Hello,\n\nHere is the detailed ${isLPG ? 'LPG' : 'Electricity'} Usage & Financial Forecast Report for user (${userEmail || 'User'}):\n\n`;

    if (isLPG && lpgResult) {
      body += `=== LPG FORECAST PARAMETERS ===\n`;
      body += `• Cylinder Price: ₹${inputPrice}\n`;
      body += `• KG per Cylinder: ${inputKg} kg\n`;
      body += `• Household Members: ${inputFamilyMembers} person(s)\n`;
      body += `• Prediction Horizon: ${selectedYears} Year(s)\n\n`;

      body += `=== USAGE & FINANCIAL PROJECTIONS ===\n`;
      body += `• Daily Gas Usage: ${lpgResult.modeled.daily_kg} kg/day\n`;
      body += `• Daily Financial Loss / Cost: ₹${lpgResult.modeled.daily_loss}\n`;
      body += `• 1 Year Projected Cost: ₹${lpgResult.modeled.projected_1_year_loss}\n`;
      body += `• ${selectedYears}-Year Multi-Year Projection: ₹${lpgResult.modeled.multi_year_projection}\n\n`;

      body += `=== DISH-BY-DISH BREAKDOWN ===\n`;
      dishItems.forEach((item, idx) => {
        const dKg = item.baseKg * effectiveMembers * (inputKg / 27.8);
        const dCost = dKg * costPerKg;
        body += `${idx + 1}. ${item.dish} (${item.degree}): ${dKg.toFixed(3)} kg/day -> ₹${dCost.toFixed(2)}/day\n`;
      });
    } else if (electricityResult) {
      body += `=== ELECTRICITY FORECAST ===\n`;
      body += `• Normal Monthly Bill: ₹${electricityResult.inputs.normalBill}\n`;
      body += `• Unpaid Bill Amount: ₹${electricityResult.inputs.unpaidBillAmount || 0}\n`;
      body += `• Daily Cost: ₹${electricityResult.daily_loss}\n`;
      body += `• 1 Year Projection: ₹${electricityResult.projected_1_year_loss}\n`;
      body += `• ${selectedYears}-Year Projection: ₹${electricityResult.multi_year_projection}\n\n`;
    }

    if (googleSheetUrl && googleSheetUrl !== 'https://sheets.new') {
      body += `\nDirect Google Sheets Link: ${googleSheetUrl}\n`;
    }

    body += `\n---\nReport generated via LPG Usage Cost & Forecast App`;

    // Download spreadsheet so user can easily attach
    try {
      const buffer = await buildExcelWorkbookBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${isLPG ? 'LPG' : 'Electricity'}_${selectedYears}Yr_Forecast.xlsx`);
    } catch (e) {
      console.warn("Could not download excel for attachment", e);
    }

    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(userEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailComposeUrl, '_blank');

    setMessage({
      text: `Opened Gmail compose window prefilled for registered email (${userEmail || 'your Gmail'}) with forecast summary! The Excel file has also been downloaded to attach.`,
      type: 'success'
    });
    setExportingTo(null);
  };

  // Native Save As handler for Excel
  const saveAsNative = async (blob: Blob, defaultFilename: string, mimeType: string, extension: string) => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [{
            description: `${extension.toUpperCase()} File`,
            accept: { [mimeType]: [`.${extension}`] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setMessage({ text: `File successfully saved as ${defaultFilename}`, type: 'success' });
        return true;
      } catch (err: any) {
        if (err.name === 'AbortError') return false; // User cancelled
        console.warn("SaveFilePicker failed, falling back to saveAs", err);
      }
    }
    saveAs(blob, defaultFilename);
    setMessage({ text: `Downloaded ${defaultFilename}`, type: 'success' });
    return true;
  };

  const handleSaveAsExcel = async () => {
    setMessage(null);
    try {
      const buffer = await buildExcelWorkbookBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const filename = `${isLPG ? 'LPG' : 'Electricity'}_${selectedYears}Yr_Forecast.xlsx`;
      await saveAsNative(blob, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
    } catch (err: any) {
      console.error("Save As error:", err);
      setMessage({ text: "Failed to save file.", type: 'error' });
    }
  };

  const handleExport = async (destination: string) => {
    if (destination === 'sync-sheets' || destination === 'Google Drive' || destination === 'Folder') {
      setFolderInputTemp(driveFolderLink || '');
      setFolderModalOpen(true);
      return;
    }

    if (destination === 'Gmail') {
      return handleGmailExport();
    }

    setExportingTo(destination);
    setMessage(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 600));

      if (destination === 'pdf') {
        const doc = new jsPDF('portrait', 'mm', 'a4');

        // Document Title Banner
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(`${isLPG ? 'LPG' : 'Electricity'} Forecast & Usage Prediction Report`, 14, 18);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`Prediction Horizon: ${selectedYears} Year(s) | Report Date: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 14, 24);

        if (isLPG && currentResult) {
          // Table 1: Compact Dish Breakdown & Parameters (Matching HTML Table 1)
          const table1Body: any[] = dishItems.map((item, idx) => {
            const dKg = item.baseKg * effectiveMembers * (inputKg / 27.8);
            const dCost = dKg * costPerKg;
            let paramLabel = '';
            let paramValue = '';
            if (idx === 0) { paramLabel = 'Cylinder Price'; paramValue = `₹${inputPrice}`; }
            else if (idx === 1) { paramLabel = 'Kg per Cylinder'; paramValue = `${inputKg} kg`; }
            else if (idx === 2) { paramLabel = 'Effective Members'; paramValue = `${effectiveMembers}`; }
            else if (idx === 3) { paramLabel = 'Cost per KG'; paramValue = `₹${costPerKg.toFixed(2)}`; }

            return [
              { content: idx + 1, styles: { halign: 'center' } },
              { content: item.dish, styles: { fontStyle: 'bold' } },
              { content: item.degree, styles: { halign: 'center' } },
              { content: `${dKg.toFixed(4)} kg`, styles: { halign: 'right' } },
              { content: `₹${dCost.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold' } },
              { content: '' },
              { content: paramLabel, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } },
              { content: paramValue, styles: { fillColor: [241, 245, 249], halign: 'right', fontStyle: 'bold' } }
            ];
          });

          // Total row
          table1Body.push([
            { content: 'Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: `${totalDailyKg.toFixed(4)} kg`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [29, 78, 216] } },
            { content: `₹${totalDailyCost.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [4, 120, 87] } },
            { content: '', colSpan: 3, styles: { fillColor: [241, 245, 249] } }
          ]);

          autoTable(doc, {
            startY: 28,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.5 },
            head: [
              [
                { content: '#', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [54, 96, 146], textColor: 255, fontStyle: 'bold' } },
                { content: 'Dishes', rowSpan: 2, styles: { valign: 'middle', fillColor: [54, 96, 146], textColor: 255, fontStyle: 'bold' } },
                { content: 'Average Degree Required', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [54, 96, 146], textColor: 255, fontStyle: 'bold' } },
                { content: 'Average Gas Kg Used', rowSpan: 2, styles: { halign: 'right', valign: 'middle', fillColor: [54, 96, 146], textColor: 255, fontStyle: 'bold' } },
                { content: 'Daily Cost (Loss)', rowSpan: 2, styles: { halign: 'right', valign: 'middle', fillColor: [54, 96, 146], textColor: 255, fontStyle: 'bold' } },
                { content: '', rowSpan: 2, styles: { cellWidth: 2, fillColor: [255, 255, 255] } },
                { content: 'LPG Parameters', colSpan: 2, styles: { halign: 'center', fillColor: [32, 80, 134], textColor: 255, fontStyle: 'bold' } }
              ],
              [
                { content: 'Parameter', styles: { fillColor: [32, 80, 134], textColor: 255, fontStyle: 'bold' } },
                { content: 'Value', styles: { fillColor: [32, 80, 134], textColor: 255, fontStyle: 'bold', halign: 'right' } }
              ]
            ],
            body: table1Body
          });

          // Forecast Summary Section
          const summaryStartY = (doc as any).lastAutoTable.finalY + 10;
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 41, 59);
          doc.text("Forecast Summary & Multi-Year Projections", 14, summaryStartY);

          const summaryRows: any[] = [];
          if (lpgResult) {
            summaryRows.push([
              'Modeled Household Usage',
              `₹${lpgResult.modeled.daily_loss} (${lpgResult.modeled.daily_kg} kg/day)`,
              `₹${lpgResult.modeled.projected_1_year_loss}`,
              `₹${lpgResult.modeled.multi_year_projection}`
            ]);
            if (lpgResult.reported) {
              summaryRows.push([
                'Reported Cylinder Refill Days',
                `₹${lpgResult.reported.daily_loss}`,
                `₹${lpgResult.reported.projected_1_year_loss}`,
                `₹${lpgResult.reported.multi_year_projection}`
              ]);
            }
            if (lpgResult.separate_prediction) {
              summaryRows.push([
                `Separate Cylinder Users (${lpgResult.separate_prediction.members} member/s)`,
                `₹${lpgResult.separate_prediction.daily_loss} (${lpgResult.separate_prediction.daily_kg} kg/day)`,
                `₹${lpgResult.separate_prediction.projected_1_year_loss}`,
                `₹${lpgResult.separate_prediction.multi_year_projection}`
              ]);
            }
          }

          autoTable(doc, {
            startY: summaryStartY + 4,
            theme: 'grid',
            head: [['Calculation Basis', 'Daily Loss (₹)', '1 Year Projection (₹)', `${selectedYears}-Year Projection (₹)`]],
            body: summaryRows,
            headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 8.5, cellPadding: 3 }
          });
        } else if (electricityResult) {
          // Table 1: Compact Appliance Breakdown & Parameters for Electricity
          const apps = electricityResult.appliance_breakdown || [];
          const elecTable1Body: any[] = apps.map((item: any, idx: number) => {
            let paramLabel = '';
            let paramValue = '';
            if (idx === 0) { paramLabel = 'Normal Monthly Bill'; paramValue = `₹${inputBill}`; }
            else if (idx === 1) { paramLabel = 'Total Consumed Units'; paramValue = `${inputUnits} kWh`; }
            else if (idx === 2) { paramLabel = 'Rate per kWh Unit'; paramValue = `₹${inputRate.toFixed(2)}`; }
            else if (idx === 3) { paramLabel = 'Billing Period'; paramValue = '30 Days'; }
            else if (idx === 4) { paramLabel = 'Prediction Horizon'; paramValue = `${selectedYears} Year(s)`; }
            else if (idx === 5) { paramLabel = 'Uploaded Bill Document'; paramValue = electricityResult.inputs?.uploadedFileName || 'Recent_Bill.pdf'; }

            return [
              { content: idx + 1, styles: { halign: 'center' } },
              { content: item.appliance, styles: { fontStyle: 'bold' } },
              { content: item.powerRating, styles: { halign: 'center' } },
              { content: `${item.dailyUnits} kWh`, styles: { halign: 'right' } },
              { content: `₹${item.dailyCost}`, styles: { halign: 'right', fontStyle: 'bold' } },
              { content: '' },
              { content: paramLabel, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } },
              { content: paramValue, styles: { fillColor: [241, 245, 249], halign: 'right', fontStyle: 'bold' } }
            ];
          });

          // Total row for Electricity
          const totalElecUnits = apps.reduce((acc: number, item: any) => acc + (item.dailyUnits || 0), 0);
          const totalElecDailyCost = apps.reduce((acc: number, item: any) => acc + (item.dailyCost || 0), 0);

          elecTable1Body.push([
            { content: 'Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: `${totalElecUnits.toFixed(2)} kWh`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [29, 78, 216] } },
            { content: `₹${totalElecDailyCost.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [4, 120, 87] } },
            { content: '', colSpan: 3, styles: { fillColor: [241, 245, 249] } }
          ]);

          autoTable(doc, {
            startY: 28,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.5 },
            head: [
              [
                { content: '#', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' } },
                { content: 'Appliance & Load Category', rowSpan: 2, styles: { valign: 'middle', fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' } },
                { content: 'Power Rating', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' } },
                { content: 'Daily Units (kWh)', rowSpan: 2, styles: { halign: 'right', valign: 'middle', fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' } },
                { content: 'Daily Cost (Loss)', rowSpan: 2, styles: { halign: 'right', valign: 'middle', fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' } },
                { content: '', rowSpan: 2, styles: { cellWidth: 2, fillColor: [255, 255, 255] } },
                { content: 'Electricity Parameters', colSpan: 2, styles: { halign: 'center', fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' } }
              ],
              [
                { content: 'Parameter', styles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' } },
                { content: 'Value', styles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right' } }
              ]
            ],
            body: elecTable1Body
          });

          const elecSumStartY = (doc as any).lastAutoTable.finalY + 8;

          autoTable(doc, {
            startY: elecSumStartY,
            theme: 'grid',
            head: [['Electricity Metric / Forecast Basis', 'Daily Cost (₹)', '1 Year Projection (₹)', `${selectedYears}-Year Projection (+Unpaid) (₹)`]],
            body: [
              [
                `Extracted Usage (${inputUnits} kWh @ ₹${inputRate.toFixed(2)}/unit)`,
                `₹${electricityResult.daily_loss}`,
                `₹${electricityResult.projected_1_year_loss}`,
                `₹${electricityResult.multi_year_projection}`
              ]
            ],
            headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 8.5, cellPadding: 3 }
          });
        }

        if (aiAnalysis) {
          const aiStartY = (doc as any).lastAutoTable.finalY + 10;
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 41, 59);
          doc.text("AI Insights & Recommendations", 14, aiStartY);

          autoTable(doc, {
            startY: aiStartY + 4,
            theme: 'plain',
            body: [[aiAnalysis]],
            styles: { fontSize: 8, cellPadding: 4, fillColor: [240, 253, 244], textColor: [22, 101, 52] },
            tableLineColor: [187, 247, 208],
            tableLineWidth: 0.5
          });
        }

        // Add Landscape Page for Household Member / Room Matrix (1 to 9)
        doc.addPage('a4', 'l');
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(`${isLPG ? 'Household Member' : 'Household / Room'} Matrix (1 to 9 ${isLPG ? 'Members' : 'Rooms'}) - ${selectedYears} Year Projection`, 14, 16);

        if (isLPG) {
          const matrixHeadRow1: any[] = [
            { content: 'Dishes', rowSpan: 2, styles: { valign: 'middle', halign: 'left', fillColor: [59, 95, 144], textColor: 255, fontStyle: 'bold' } },
            { content: 'Avg Degree', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [59, 95, 144], textColor: 255, fontStyle: 'bold' } },
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(m => ({
              content: `Family Member ${m}`,
              colSpan: 4,
              styles: { halign: 'center', fillColor: [45, 75, 115], textColor: 255, fontStyle: 'bold' }
            }))
          ];

          const matrixHeadRow2: any[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(() => [
            { content: 'Gas Kg', styles: { halign: 'center', fillColor: [48, 82, 127], textColor: 255, fontStyle: 'bold' } },
            { content: 'Daily Cost', styles: { halign: 'center', fillColor: [48, 82, 127], textColor: 255, fontStyle: 'bold' } },
            { content: 'Lifespan', styles: { halign: 'center', fillColor: [48, 82, 127], textColor: 255, fontStyle: 'bold' } },
            { content: `Loss (${selectedYears}Y)`, styles: { halign: 'center', fillColor: [48, 82, 127], textColor: 255, fontStyle: 'bold' } }
          ]);

          const matrixBody = dishItems.map((item, idx) => {
            const row: any[] = [
              { content: item.dish, styles: { fontStyle: 'bold' } },
              { content: item.degree, styles: { halign: 'center' } }
            ];
            [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(m => {
              const avgKg = item.baseKg * m * (inputKg / 27.8);
              const dailyCost = avgKg * costPerKg;
              const lifespanM = inputKg / (avgKg * 30);
              const yrLoss = dailyCost * 365 * selectedYears;

              row.push(
                { content: avgKg.toFixed(3), styles: { halign: 'right' } },
                { content: `₹${dailyCost.toFixed(1)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] } },
                { content: `${lifespanM.toFixed(1)}m`, styles: { halign: 'center' } },
                { content: `₹${yrLoss.toFixed(0)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [29, 78, 216] } }
              );
            });
            return row;
          });

          autoTable(doc, {
            startY: 22,
            theme: 'grid',
            styles: { fontSize: 6, cellPadding: 1.5, overflow: 'ellipsize' },
            head: [matrixHeadRow1, matrixHeadRow2],
            body: matrixBody
          });
        } else if (electricityResult) {
          const matrixHeadRow1E: any[] = [
            { content: 'Appliance', rowSpan: 2, styles: { valign: 'middle', halign: 'left', fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' } },
            { content: 'Power Rating', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' } },
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(m => ({
              content: `Household / Room ${m}`,
              colSpan: 4,
              styles: { halign: 'center', fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' }
            }))
          ];

          const matrixHeadRow2E: any[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(() => [
            { content: 'kWh Units', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' } },
            { content: 'Daily Cost', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' } },
            { content: 'Est Hours', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' } },
            { content: `Loss (${selectedYears}Y)`, styles: { halign: 'center', fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' } }
          ]);

          const appsE = electricityResult.appliance_breakdown || [];
          const matrixBodyE = appsE.map((item: any) => {
            const row: any[] = [
              { content: item.appliance, styles: { fontStyle: 'bold' } },
              { content: item.powerRating, styles: { halign: 'center' } }
            ];
            [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(m => {
              const u = item.dailyUnits * m;
              const c = item.dailyCost * m;
              const h = (item.sharePercent * 0.24 * m);
              const l = item.yrLoss * m;

              row.push(
                { content: u.toFixed(2), styles: { halign: 'right' } },
                { content: `₹${c.toFixed(1)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] } },
                { content: `${h.toFixed(1)}h`, styles: { halign: 'center' } },
                { content: `₹${l.toFixed(0)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [29, 78, 216] } }
              );
            });
            return row;
          });

          autoTable(doc, {
            startY: 22,
            theme: 'grid',
            styles: { fontSize: 6, cellPadding: 1.5, overflow: 'ellipsize' },
            head: [matrixHeadRow1E, matrixHeadRow2E],
            body: matrixBodyE
          });
        }

        doc.save(`Forecast_Report_${selectedYears}yr.pdf`);
        setMessage({ text: `Downloaded PDF report: Forecast_Report_${selectedYears}yr.pdf`, type: 'success' });
      } else if (destination === 'sheets') {
        const buffer = await buildExcelWorkbookBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${isLPG ? 'LPG' : 'Electricity'}_${selectedYears}yr_Forecast.xlsx`);
      } else {
        setMessage({ text: `Successfully exported to ${destination}!`, type: 'success' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: "Failed to export data.", type: 'error' });
    } finally {
      setExportingTo(null);
    }
  };

  const totalDailyKg = dishItems.reduce((acc, item) => acc + item.baseKg * effectiveMembers * (inputKg / 27.8), 0);
  const totalDailyCost = totalDailyKg * costPerKg;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Live Interactive Inputs Header for On-Screen Recalculation */}
        {isLPG ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Interactive LPG Prediction & Dish Analysis</h1>
                <p className="text-xs text-slate-500 mt-1">Adjust parameters below to dynamically recalculate dish usage, lifespan, and multi-year loss</p>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold self-start md:self-auto">
                <span className="text-slate-500 px-2 flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1" /> Timeframe:
                </span>
                {[1, 2, 3, 5, 10].map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => handleYearsChange(yr)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      selectedYears === yr
                        ? 'bg-blue-600 text-white shadow-sm font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {yr} {yr === 1 ? 'Yr' : 'Yrs'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recalculation controls */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cylinder Price (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={inputPrice}
                  onChange={(e) => setInputPrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Kg per Cylinder</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={inputKg}
                  onChange={(e) => setInputKg(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Family Members</label>
                <input
                  type="number"
                  min="1"
                  value={inputFamilyMembers}
                  onChange={(e) => setInputFamilyMembers(parseInt(e.target.value, 10) || 1)}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Separate Users</label>
                <input
                  type="number"
                  min="0"
                  value={inputSeparateUsers}
                  onChange={(e) => setInputSeparateUsers(parseInt(e.target.value, 10) || 0)}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* View Tabs */}
            <div className="flex items-center gap-2 mt-6 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('compact')}
                className={`px-4 py-2 rounded-lg flex items-center transition-all ${activeTab === 'compact' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Table className="w-3.5 h-3.5 mr-1.5" /> Compact Dish Breakdown & Parameters
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`px-4 py-2 rounded-lg flex items-center transition-all ${activeTab === 'matrix' ? 'bg-blue-700 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Layers className="w-3.5 h-3.5 mr-1.5" /> Household Member Matrix (1 to 9)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 rounded-lg flex items-center transition-all ${activeTab === 'summary' ? 'bg-emerald-700 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" /> Forecast Summary
              </button>
              {lpgResult?.separate_prediction && (
                <button
                  type="button"
                  onClick={() => setActiveTab('separate')}
                  className={`px-4 py-2 rounded-lg flex items-center transition-all ${activeTab === 'separate' ? 'bg-indigo-700 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Separate Cylinder Users ({lpgResult.separate_prediction.members})
                </button>
              )}
            </div>

            {/* TAB CONTENT 1: Compact Dish Breakdown + Parameters (Matching HTML Table 1) */}
            {activeTab === 'compact' && (
              <div className="mt-6">
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-[#366092] text-white">
                        <th className="p-3 font-bold border-b border-r border-[#2a4d77] text-center w-12">#</th>
                        <th className="p-3 font-bold border-b border-r border-[#2a4d77]">Dishes</th>
                        <th className="p-3 font-bold border-b border-r border-[#2a4d77] text-center">Average Degree Required</th>
                        <th className="p-3 font-bold border-b border-r border-[#2a4d77] text-right">Average Gas Kg Used</th>
                        <th className="p-3 font-bold border-b border-r border-[#2a4d77] text-right">Daily Cost (Loss)</th>
                        <th className="p-3 border-b border-r border-[#2a4d77] w-4"></th>
                        <th className="p-3 font-bold border-b border-[#205086] bg-[#205086] text-white" colSpan={2}>LPG Parameters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dishItems.map((item, idx) => {
                        const dKg = item.baseKg * effectiveMembers * (inputKg / 27.8);
                        const dCost = dKg * costPerKg;
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f8f8ff]'}>
                            <td className="p-2.5 text-center font-bold text-slate-500 border-b border-r border-slate-200">{idx + 1}</td>
                            <td className="p-2.5 font-semibold text-slate-800 border-b border-r border-slate-200">{item.dish}</td>
                            <td className="p-2.5 text-center font-mono text-slate-600 border-b border-r border-slate-200">{item.degree}</td>
                            <td className="p-2.5 text-right font-mono text-slate-800 border-b border-r border-slate-200">{dKg.toFixed(4)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900 border-b border-r border-slate-200">₹{dCost.toFixed(2)}</td>
                            <td className="border-b border-r border-slate-200"></td>
                            {idx === 0 && (
                              <>
                                <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Cylinder Price</td>
                                <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">₹{inputPrice}</td>
                              </>
                            )}
                            {idx === 1 && (
                              <>
                                <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Kg per Cylinder</td>
                                <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">{inputKg}</td>
                              </>
                            )}
                            {idx === 2 && (
                              <>
                                <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Effective Members</td>
                                <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">{effectiveMembers}</td>
                              </>
                            )}
                            {idx === 3 && (
                              <>
                                <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Cost per KG</td>
                                <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">₹{costPerKg.toFixed(2)}</td>
                              </>
                            )}
                            {idx > 3 && (
                              <>
                                <td className="border-b border-r border-slate-200 bg-slate-50"></td>
                                <td className="border-b border-slate-200 bg-slate-50"></td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td colSpan={3} className="p-3 text-right border-r border-slate-300">Total</td>
                        <td className="p-3 text-right font-mono text-blue-700 border-r border-slate-300">{totalDailyKg.toFixed(4)} kg</td>
                        <td className="p-3 text-right font-mono text-emerald-800 border-r border-slate-300">₹{totalDailyCost.toFixed(2)}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: Family Member Matrix 1 to 9 (Matching HTML Table 2) */}
            {activeTab === 'matrix' && (
              <div className="mt-6">
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <table className="w-full text-xs text-left border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-[#3b5f90] text-white">
                        <th className="p-2.5 font-bold border-r border-b border-[#2e4d77] sticky left-0 bg-[#3b5f90] z-10" rowSpan={2}>Dishes</th>
                        <th className="p-2.5 font-bold border-r border-b border-[#2e4d77] text-center" rowSpan={2}>Average Degree Required</th>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                          <th key={m} colSpan={4} className="p-2 text-center font-bold border-b border-r border-[#2e4d77] bg-[#2d4b73]">
                            Family Member {m}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-[#30527f] text-white">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                          <React.Fragment key={m}>
                            <th className="p-2 font-semibold text-center border-r border-[#254269]">Gas Kg Used</th>
                            <th className="p-2 font-semibold text-center border-r border-[#254269]">Daily Cost</th>
                            <th className="p-2 font-semibold text-center border-r border-[#254269]">Lifespan (Months)</th>
                            <th className="p-2 font-semibold text-center border-r border-[#254269]">Loss ({selectedYears} Yr{selectedYears > 1 ? 's' : ''})</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dishItems.map((item, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f8f8ff]'}>
                          <td className="p-2.5 font-bold text-slate-800 border-b border-r border-slate-200 sticky left-0 bg-inherit z-10">{item.dish}</td>
                          <td className="p-2.5 text-center font-mono text-slate-600 border-b border-r border-slate-200">{item.degree}</td>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => {
                            const avgKg = item.baseKg * m * (inputKg / 27.8);
                            const dailyCost = avgKg * costPerKg;
                            const lifespanM = inputKg / (avgKg * 30);
                            const lifespanDays = Math.round(inputKg / (avgKg || 1));
                            const yrLoss = dailyCost * 365 * selectedYears;
                            return (
                              <React.Fragment key={m}>
                                <td className="p-2 text-right font-mono border-b border-r border-slate-200">{avgKg.toFixed(4)}</td>
                                <td className="p-2 text-right font-mono text-emerald-700 font-bold border-b border-r border-slate-200">₹{dailyCost.toFixed(2)}</td>
                                <td className="p-2 text-center font-mono text-slate-600 border-b border-r border-slate-200">{lifespanM.toFixed(2)} ({lifespanDays}d)</td>
                                <td className="p-2 text-right font-mono text-blue-800 font-bold border-b border-r border-slate-200">₹{yrLoss.toFixed(2)}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: Forecast Summary Cards */}
            {activeTab === 'summary' && currentResult && (
              <div className="mt-6 space-y-6">
                {lpgResult ? (
                  <>
                    <div>
                      <h3 className="font-semibold text-slate-800 mb-2">Based on Modeled Household Usage</h3>
                      <p className="text-xs text-slate-500 mb-4">{lpgResult.modeled.basis}</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Daily Loss</div>
                          <div className="text-2xl font-bold text-slate-900">₹{lpgResult.modeled.daily_loss}</div>
                          <div className="text-xs text-slate-500 mt-1">{lpgResult.modeled.daily_kg} kg / day</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">1 Year Projection</div>
                          <div className="text-2xl font-bold text-slate-900">₹{lpgResult.modeled.projected_1_year_loss}</div>
                        </div>
                        <div className="bg-emerald-50/70 p-4 rounded-xl shadow-sm border border-emerald-200">
                          <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">{selectedYears} Year Projection</div>
                          <div className="text-2xl font-bold text-emerald-900">₹{lpgResult.modeled.multi_year_projection}</div>
                        </div>
                      </div>
                    </div>

                    {lpgResult.reported && (
                      <div className="border-t border-slate-200 pt-4">
                        <h3 className="font-semibold text-slate-800 mb-2">Based on Reported Cylinder Refill Days</h3>
                        <p className="text-xs text-slate-500 mb-4">{lpgResult.reported.basis}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Daily Loss</div>
                            <div className="text-2xl font-bold text-slate-900">₹{lpgResult.reported.daily_loss}</div>
                          </div>
                          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">1 Year Projection</div>
                            <div className="text-2xl font-bold text-slate-900">₹{lpgResult.reported.projected_1_year_loss}</div>
                          </div>
                          <div className="bg-blue-50/70 p-4 rounded-xl shadow-sm border border-blue-200">
                            <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">{selectedYears} Year Projection</div>
                            <div className="text-2xl font-bold text-blue-900">₹{lpgResult.reported.multi_year_projection}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* TAB CONTENT 4: Separate Cylinder Users */}
            {activeTab === 'separate' && lpgResult?.separate_prediction && (
              <div className="mt-6">
                <div className="bg-indigo-50/40 border border-indigo-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-indigo-900 text-base">Separate Cylinder Users Prediction</h3>
                    <span className="text-xs bg-indigo-200 text-indigo-800 font-bold px-3 py-1 rounded-full">
                      {lpgResult.separate_prediction.members} Member(s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">{lpgResult.separate_prediction.basis}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                      <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Daily Loss</div>
                      <div className="text-xl font-bold text-slate-900">₹{lpgResult.separate_prediction.daily_loss}</div>
                      <div className="text-xs text-slate-500 mt-1">{lpgResult.separate_prediction.daily_kg} kg/day</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                      <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">1 Year Projection</div>
                      <div className="text-xl font-bold text-slate-900">₹{lpgResult.separate_prediction.projected_1_year_loss}</div>
                      <div className="text-xs text-slate-500 mt-1">~{lpgResult.separate_prediction.cylinders_per_year} cylinders/yr</div>
                    </div>
                    <div className="bg-indigo-100/50 p-4 rounded-lg shadow-sm border border-indigo-300">
                      <div className="text-xs font-bold text-indigo-700 mb-1 uppercase tracking-wider">{selectedYears} Year Projection</div>
                      <div className="text-xl font-bold text-indigo-950">₹{lpgResult.separate_prediction.multi_year_projection}</div>
                      <div className="text-xs text-indigo-600 mt-1">Refill every ~{lpgResult.separate_prediction.days_per_cylinder} days</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ELECTRICITY WIDE FORMAT VIEW */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center">
                  <span className="p-1.5 bg-blue-100 text-blue-800 rounded-lg mr-2"><Zap className="w-5 h-5" /></span>
                  Electricity Usage & Appliance Consumption Forecast
                </h1>
                <p className="text-xs text-slate-500 mt-1">Extracted from uploaded paid bill document, with itemized appliance load breakdown & multi-year matrix</p>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold self-start md:self-auto">
                <span className="text-slate-500 px-2 flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1" /> Timeframe:
                </span>
                {[1, 2, 3, 5, 7, 10].map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => handleYearsChange(yr)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      selectedYears === yr
                        ? 'bg-blue-600 text-white shadow-sm font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {yr} {yr === 1 ? 'Yr' : 'Yrs'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recalculation controls for Electricity */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Normal Monthly Bill (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={inputBill}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setInputBill(val);
                    if (val > 0 && inputRate > 0) {
                      setInputUnits(Math.round(val / inputRate));
                    }
                  }}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Consumed Units (kWh)</label>
                <input
                  type="number"
                  min="1"
                  value={inputUnits}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setInputUnits(val);
                    if (val > 0 && inputBill > 0) {
                      setInputRate(Number((inputBill / val).toFixed(2)));
                    }
                  }}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tariff Rate (₹/kWh)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={inputRate}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setInputRate(val);
                    if (val > 0 && inputUnits > 0) {
                      setInputBill(Math.round(inputUnits * val));
                    }
                  }}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Extracted Document</label>
                <div className="h-10 px-3 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-bold text-emerald-900 flex items-center truncate">
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600 flex-shrink-0" />
                  <span className="truncate">{electricityResult?.inputs?.uploadedFileName || 'Recent_Bill.pdf'}</span>
                </div>
              </div>
            </div>

            {/* View Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('compact')}
                className={`px-4 py-2 rounded-lg flex items-center transition-all ${activeTab === 'compact' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Table className="w-3.5 h-3.5 mr-1.5" /> Compact Appliance Breakdown & Parameters
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`px-4 py-2 rounded-lg flex items-center transition-all ${activeTab === 'matrix' ? 'bg-blue-700 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Layers className="w-3.5 h-3.5 mr-1.5" /> Household / Room Matrix (1 to 9)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 rounded-lg flex items-center transition-all ${activeTab === 'summary' ? 'bg-emerald-700 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" /> Forecast Summary
              </button>
            </div>

            {/* TAB CONTENT 1: Compact Appliance Breakdown + Parameters */}
            {activeTab === 'compact' && electricityResult && (
              <div className="mt-6">
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-[#1e3a8a] text-white">
                        <th className="p-3 font-bold border-b border-r border-[#172554] text-center w-12">#</th>
                        <th className="p-3 font-bold border-b border-r border-[#172554]">Appliance & Power Load</th>
                        <th className="p-3 font-bold border-b border-r border-[#172554] text-center">Power Rating</th>
                        <th className="p-3 font-bold border-b border-r border-[#172554] text-right">Daily Units (kWh)</th>
                        <th className="p-3 font-bold border-b border-r border-[#172554] text-right">Daily Cost (Loss)</th>
                        <th className="p-3 border-b border-r border-[#172554] w-4"></th>
                        <th className="p-3 font-bold border-b border-[#0f172a] bg-[#0f172a] text-white" colSpan={2}>Electricity Parameters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(electricityResult.appliance_breakdown || []).map((item: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
                          <td className="p-2.5 text-center font-bold text-slate-500 border-b border-r border-slate-200">{idx + 1}</td>
                          <td className="p-2.5 font-semibold text-slate-800 border-b border-r border-slate-200">{item.appliance}</td>
                          <td className="p-2.5 text-center font-mono text-slate-600 border-b border-r border-slate-200">{item.powerRating}</td>
                          <td className="p-2.5 text-right font-mono text-slate-800 border-b border-r border-slate-200">{item.dailyUnits} kWh</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900 border-b border-r border-slate-200">₹{item.dailyCost}</td>
                          <td className="border-b border-r border-slate-200"></td>
                          {idx === 0 && (
                            <>
                              <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Normal Monthly Bill</td>
                              <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">₹{inputBill}</td>
                            </>
                          )}
                          {idx === 1 && (
                            <>
                              <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Total Consumed Units</td>
                              <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">{inputUnits} kWh</td>
                            </>
                          )}
                          {idx === 2 && (
                            <>
                              <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Rate per kWh Unit</td>
                              <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">₹{inputRate.toFixed(2)}</td>
                            </>
                          )}
                          {idx === 3 && (
                            <>
                              <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Billing Period</td>
                              <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">30 Days</td>
                            </>
                          )}
                          {idx === 4 && (
                            <>
                              <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Prediction Horizon</td>
                              <td className="p-2.5 font-bold text-slate-900 text-right border-b border-slate-200 bg-slate-100">{selectedYears} Year(s)</td>
                            </>
                          )}
                          {idx === 5 && (
                            <>
                              <td className="p-2.5 font-medium text-slate-700 border-b border-r border-slate-200 bg-slate-100">Uploaded Bill Document</td>
                              <td className="p-2.5 font-bold text-emerald-800 text-right border-b border-slate-200 bg-slate-100 truncate max-w-[120px]">
                                {electricityResult.inputs?.uploadedFileName || 'Recent_Bill.pdf'}
                              </td>
                            </>
                          )}
                          {idx > 5 && (
                            <>
                              <td className="border-b border-r border-slate-200 bg-slate-50"></td>
                              <td className="border-b border-slate-200 bg-slate-50"></td>
                            </>
                          )}
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td colSpan={3} className="p-3 text-right border-r border-slate-300">Total</td>
                        <td className="p-3 text-right font-mono text-blue-700 border-r border-slate-300">
                          {((electricityResult.appliance_breakdown || []).reduce((acc: number, item: any) => acc + item.dailyUnits, 0)).toFixed(2)} kWh
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-800 border-r border-slate-300">
                          ₹{((electricityResult.appliance_breakdown || []).reduce((acc: number, item: any) => acc + item.dailyCost, 0)).toFixed(2)}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: Household / Room Matrix 1 to 9 */}
            {activeTab === 'matrix' && electricityResult && (
              <div className="mt-6">
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <table className="w-full text-xs text-left border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-[#1e3a8a] text-white">
                        <th className="p-2.5 font-bold border-r border-b border-[#172554] sticky left-0 bg-[#1e3a8a] z-10" rowSpan={2}>Appliance</th>
                        <th className="p-2.5 font-bold border-r border-b border-[#172554] text-center" rowSpan={2}>Power Rating</th>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                          <th key={m} colSpan={4} className="p-2 text-center font-bold border-b border-r border-[#172554] bg-[#1e40af]">
                            Household / Room {m}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-[#2563eb] text-white">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                          <React.Fragment key={m}>
                            <th className="p-2 font-semibold text-center border-r border-[#1d4ed8]">kWh Units/Day</th>
                            <th className="p-2 font-semibold text-center border-r border-[#1d4ed8]">Daily Cost</th>
                            <th className="p-2 font-semibold text-center border-r border-[#1d4ed8]">Est Hours</th>
                            <th className="p-2 font-semibold text-center border-r border-[#1d4ed8]">Loss ({selectedYears} Yr{selectedYears > 1 ? 's' : ''})</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(electricityResult.appliance_breakdown || []).map((item: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
                          <td className="p-2.5 font-bold text-slate-800 border-b border-r border-slate-200 sticky left-0 bg-inherit z-10">{item.appliance}</td>
                          <td className="p-2.5 text-center font-mono text-slate-600 border-b border-r border-slate-200">{item.powerRating}</td>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => {
                            const u = item.dailyUnits * m;
                            const c = item.dailyCost * m;
                            const h = (item.sharePercent * 0.24 * m);
                            const l = item.yrLoss * m;
                            return (
                              <React.Fragment key={m}>
                                <td className="p-2 text-right font-mono border-b border-r border-slate-200">{u.toFixed(2)}</td>
                                <td className="p-2 text-right font-mono text-emerald-700 font-bold border-b border-r border-slate-200">₹{c.toFixed(2)}</td>
                                <td className="p-2 text-center font-mono text-slate-600 border-b border-r border-slate-200">{h.toFixed(1)}h</td>
                                <td className="p-2 text-right font-mono text-blue-800 font-bold border-b border-r border-slate-200">₹{l.toFixed(2)}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: Forecast Summary Cards for Electricity */}
            {activeTab === 'summary' && electricityResult && (
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="font-semibold text-slate-800 mb-2">Electricity Bill Forecast</h3>
                  <p className="text-xs text-slate-500 mb-4">{electricityResult.basis}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Daily Loss</div>
                      <div className="text-2xl font-bold text-slate-900">₹{electricityResult.daily_loss}</div>
                      <div className="text-xs text-slate-500 mt-1">{electricityResult.daily_units} kWh / day</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">1 Year Projection</div>
                      <div className="text-2xl font-bold text-slate-900">₹{electricityResult.projected_1_year_loss}</div>
                    </div>
                    <div className="bg-amber-50/70 p-4 rounded-xl shadow-sm border border-amber-200">
                      <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">{selectedYears} Year Projection (+Unpaid)</div>
                      <div className="text-2xl font-bold text-amber-900">₹{electricityResult.multi_year_projection}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Analysis Section */}
        {currentResult && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <Brain className="w-5 h-5 mr-2 text-purple-600" />
                AI Smart Forecast Analysis
              </h3>
              {!aiAnalysis && (
                <Button
                  variant="outline"
                  
                  onClick={handleAnalyze}
                  isLoading={analyzing}
                  className="border-purple-200 text-purple-700 hover:bg-purple-50"
                >
                  Generate Insights
                </Button>
              )}
            </div>

            {aiAnalysis && (
              <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-5 text-purple-900 leading-relaxed text-sm whitespace-pre-wrap font-medium">
                {aiAnalysis}
              </div>
            )}
          </div>
        )}

        {/* Export & Sync Actions Box */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Export & Sync Your Forecast Calculations
          </h2>
          <p className="text-slate-500 text-xs max-w-lg mx-auto mb-6">
            Export formatted spreadsheets matching Google Sheets with dynamic formulas, dish breakdown, and household scaling.
          </p>

          {message && (
            <div className={`mb-6 p-4 rounded-xl border text-xs font-medium ${message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
              <p>{message.text}</p>
              {googleSheetUrl && (
                <div className="mt-3">
                  <a
                    href={googleSheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all"
                  >
                    Open in Google Sheets <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Primary Sync to Google Sheets Banner */}
          <div className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Table className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Sync directly to Google Sheets</h3>
              </div>
              <p className="text-xs text-slate-600 max-w-md">
                Exports formatted workbook directly to Google Sheets with Compact Dish Breakdown, Household Member Matrix, and dynamic formulas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs whitespace-nowrap shadow-sm"
                onClick={() => {
                  setFolderInputTemp(driveFolderLink || '');
                  setFolderModalOpen(true);
                }}
                isLoading={exportingTo === 'sync-sheets' || exportingTo === 'Google Drive' || exportingTo === 'Folder'}
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Sync to Google Sheets
              </Button>

              <button
                type="button"
                onClick={handleCopyCSV}
                className="inline-flex items-center px-4 py-2.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl transition-all shadow-sm"
              >
                {copiedCsv ? <Check className="w-4 h-4 mr-1.5 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1.5" />}
                {copiedCsv ? 'CSV Copied!' : 'Copy CSV Data'}
              </button>
            </div>
          </div>

          {/* Additional Cloud Export Options */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <Button
              variant="outline"
              className="rounded-full px-5 text-xs hover:bg-emerald-50 border-emerald-200 text-emerald-800 font-bold"
              onClick={() => {
                setFolderInputTemp(driveFolderLink || '');
                setFolderModalOpen(true);
              }}
              isLoading={exportingTo === 'Google Drive' || exportingTo === 'Folder'}
            >
              <HardDrive className="w-3.5 h-3.5 mr-2 text-emerald-600" />
              Save to Google Drive
            </Button>

            <Button
              variant="outline"
              className="rounded-full px-5 text-xs hover:bg-amber-50 border-amber-200 text-amber-900 font-bold"
              onClick={handleSaveAsExcel}
            >
              <Download className="w-3.5 h-3.5 mr-2 text-amber-600" />
              Save As...
            </Button>

            <Button
              variant="outline"
              className="rounded-full px-5 text-xs hover:bg-red-50 border-red-200 text-red-900 font-bold"
              onClick={() => handleExport('Gmail')}
              isLoading={exportingTo === 'Gmail'}
            >
              <Mail className="w-3.5 h-3.5 mr-2 text-red-600" />
              Send to Gmail ({user?.email || 'Registered Email'})
            </Button>
          </div>

          <div className="flex items-center justify-center mb-6">
            <div className="w-24 border-t border-slate-200"></div>
            <span className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">or download offline</span>
            <div className="w-24 border-t border-slate-200"></div>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Button
              variant="outline"
              className="rounded-full px-6 py-2.5 text-xs font-bold"
              onClick={handleDownloadCSV}
            >
              <Download className="w-4 h-4 mr-2 text-blue-600" />
              Download CSV (.csv)
            </Button>

            <Button
              variant="outline"
              className="rounded-full px-6 py-2.5 text-xs font-bold"
              onClick={() => handleExport('sheets')}
              isLoading={exportingTo === 'sheets'}
            >
              <Table className="w-4 h-4 mr-2 text-emerald-600" />
              Download Excel (.xlsx)
            </Button>

            <Button
              variant="outline"
              className="rounded-full px-6 py-2.5 text-xs font-bold"
              onClick={() => handleExport('pdf')}
              isLoading={exportingTo === 'pdf'}
            >
              <FileText className="w-4 h-4 mr-2 text-rose-600" />
              Download PDF Report
            </Button>
          </div>
        </div>

        {/* Google Drive Folder Dialog Modal */}
        {folderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 text-left relative">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                    <HardDrive className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Save to Google Drive</h3>
                    <p className="text-xs text-slate-500">Paste your Google Drive folder link or save directly to Google Drive</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFolderModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg text-sm"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Google Drive Folder Link (Optional)</label>
                <input
                  type="text"
                  placeholder="https://drive.google.com/drive/folders/1a2b3c4d..."
                  value={folderInputTemp}
                  onChange={(e) => setFolderInputTemp(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Paste a folder link to save into a specific Drive folder, or leave blank to save to your main Drive.
                </p>
              </div>

              <div className="pt-2">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm"
                  onClick={() => {
                    setFolderModalOpen(false);
                    if (folderInputTemp.trim()) {
                      setDriveFolderLink(folderInputTemp.trim());
                      localStorage.setItem('google_drive_folder_link', folderInputTemp.trim());
                    }
                    handleSaveToGoogleDrive(folderInputTemp.trim());
                  }}
                >
                  Save to Google Drive
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
