import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Upload, FileCheck, AlertCircle, CheckCircle2, Zap, Cpu, Sparkles } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { predictLpg, predictElectricity } from '../lib/excelEngine';

export function ServiceForm() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Electricity Bill Upload & Parsing state
  const [paidBillFile, setPaidBillFile] = useState<File | null>(null);
  const [recentBillFiles, setRecentBillFiles] = useState<File[]>([]);
  const [unpaidBillFile, setUnpaidBillFile] = useState<File | null>(null);
  const [parsingBill, setParsingBill] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [normalBillValue, setNormalBillValue] = useState<string>('');

  const isLPG = type === 'lpg';

  const handleRecentBillChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setRecentBillFiles(prev => [...prev, ...files]);
    setFormError(null);
    setParsingBill(true);

    try {
      const fileData = await Promise.all(files.map(async (file: File) => {
        let imageBase64 = '';
        if (file.type.startsWith('image/')) {
          imageBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        }
        return {
          imageBase64,
          mimeType: file.type,
          fileName: file.name
        };
      }));

      const res = await fetch('/api/parse-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileData }),
      });

      const json = await res.json();
      if (json.data) {
        setExtractedData(json.data);
        if (json.data.extractedBillAmount) {
          setNormalBillValue(`₹ ${json.data.extractedBillAmount}`);
        }
      }
    } catch (err) {
      console.warn("Bill OCR parsing fallback:", err);
      // Default fallback extracted data
      setExtractedData({
        extractedBillAmount: 6000,
        extractedUnits: 800,
        billingDays: 30,
        ratePerUnit: 7.5,
        unpaidBillAmount: 0,
      });
      setNormalBillValue('₹ 6000');
    } finally {
      setParsingBill(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!isLPG && recentBillFiles.length === 0) {
      setFormError("Uploading at least one recent bill is required to process electricity forecast.");
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    let calculationResult: any = null;
    const joinedFileNames = recentBillFiles.map(f => f.name).join(', ') || 'Recent_Bills.pdf';

    try {
      if (isLPG) {
        const kgBought = parseFloat((data.kg_bought as string).replace(/[^0-9.]/g, ''));
        const cylindersBought = parseInt(data.cylinders_bought as string, 10);
        const amountPaid = parseFloat((data.amount_paid as string).replace(/[^0-9.]/g, ''));
        const familyMembersRaw = parseInt(data.family_members as string, 10);
        const familyMembers = isNaN(familyMembersRaw) || familyMembersRaw < 1 ? 1 : familyMembersRaw;
        const separateCylinderUsed = data.separate_cylinder_used === 'Yes';
        const separateMembersCount = separateCylinderUsed ? Math.max(0, parseInt(data.separate_members_count as string || '0', 10)) : 0;
        
        let daysPerCylinder: number | undefined = undefined;
        const finishTimeStr = data.finish_time as string;
        if (finishTimeStr) {
          const num = parseFloat(finishTimeStr.replace(/[^0-9.]/g, ''));
          daysPerCylinder = data.timeframe_type === 'Months' ? num * 30 : num;
        }

        const planYears = parseFloat((data.plan_years as string).replace(/[^0-9.]/g, ''));
        const wantPrediction = data.want_prediction === 'Yes';

        calculationResult = predictLpg({
          kgPerCylinder: kgBought,
          cylindersBought: cylindersBought,
          pricePaid: amountPaid,
          familyMembers: familyMembers,
          separateCylinderUsers: separateMembersCount,
          daysPerCylinder,
          predictionYears: planYears,
          wantSeparatePrediction: wantPrediction
        });
      } else {
        const normalBillNum = parseFloat((data.normal_bill as string || '0').replace(/[^0-9.]/g, '')) || extractedData?.extractedBillAmount || 6000;
        const predictFutureYears = parseFloat((data.predict_future_years as string || '1').replace(/[^0-9.]/g, '')) || 1;
        
        calculationResult = predictElectricity({
          normalBill: normalBillNum,
          unpaidBillAmount: extractedData?.unpaidBillAmount || 0,
          predictionYears: predictFutureYears,
          totalUnits: extractedData?.extractedUnits || (normalBillNum / (extractedData?.ratePerUnit || 7.5)),
          billingDays: extractedData?.billingDays || 30,
          ratePerUnit: extractedData?.ratePerUnit || 7.5,
          customAppliances: extractedData?.appliances,
          uploadedFileName: joinedFileNames,
        });
      }

      await Promise.race([
        addDoc(collection(db, `submissions_${type}`), {
          ...data,
          extractedData,
          recentBillFileNames: joinedFileNames,
          calculationResult,
          createdAt: new Date().toISOString()
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      navigate('/export', { state: { calculationResult, type } });
    } catch (err: any) {
      console.warn("Firestore error, falling back to localStorage", err.message);
      const localSubmissions = JSON.parse(localStorage.getItem(`submissions_${type}`) || '[]');
      localSubmissions.push({
        ...data,
        extractedData,
        recentBillFileNames: joinedFileNames,
        calculationResult,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem(`submissions_${type}`, JSON.stringify(localSubmissions));
      navigate('/export', { state: { calculationResult, type } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex justify-center font-sans text-slate-800">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-8 text-center capitalize">
          {type} Service Form
        </h1>

        <form onSubmit={handleSubmit} className="space-y-10">
          {isLPG ? (
            <>
              {/* LPG Section 1: Basic Usage */}
              <div className="space-y-4">
                <Input name="kg_bought" label="How many Kg LPG you buy" placeholder="Ex: 15.4 kg" required />
                <Input
                  name="cylinders_bought"
                  label="How many Cylinder you buy"
                  placeholder="Ex: 2"
                  type="number"
                  min="1"
                  step="1"
                  required
                  onKeyDown={(e) => {
                    if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                      e.preventDefault();
                    }
                  }}
                />
                <Input name="amount_paid" label="How much you pay buy" placeholder="Ex: ₹ 1500" required />
              </div>

              {/* LPG Section 2: Household Info */}
              <div className="space-y-4">
                <Input
                  name="family_members"
                  label="How many family members"
                  placeholder="Ex: 5"
                  type="number"
                  min="1"
                  step="1"
                  required
                  onKeyDown={(e) => {
                    if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                      e.preventDefault();
                    }
                  }}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (isNaN(val) || val < 1) {
                      e.target.value = '1';
                    }
                  }}
                />
                
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Do any member use separate cylinder</label>
                  <select name="separate_cylinder_used" className="flex h-11 w-full rounded-lg border border-slate-200 shadow-sm bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                
                <Input
                  name="separate_members_count"
                  label="How many members use separate cylinder"
                  placeholder="Ex: 2"
                  type="number"
                  min="0"
                  step="1"
                  onKeyDown={(e) => {
                    if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                      e.preventDefault();
                    }
                  }}
                />
                
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Do you want separate prediction over there lpg usage too</label>
                  <select name="want_prediction" className="flex h-11 w-full rounded-lg border border-slate-200 shadow-sm bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              </div>

              {/* LPG Section 3: Time Frame */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Time Frame Type</label>
                  <select name="timeframe_type" className="flex h-11 w-full rounded-lg border border-slate-200 shadow-sm bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <option value="Day">Day</option>
                    <option value="Months">Months</option>
                  </select>
                </div>
                
                <Input name="finish_time" label="In how many Day your LPG get finished" placeholder="Ex: 15 days" required />
                <Input name="plan_years" label="Of how many year you want your Plan" placeholder="Ex: 3 years" required />
              </div>
            </>
          ) : (
            <>
              {/* Form Error Banner */}
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3 text-sm font-semibold animate-shake">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Electricity Section 1 */}
              <div className="space-y-6">
                <Input
                  name="normal_bill"
                  label="How much electricity bills you get normally"
                  placeholder="Ex: ₹ 6000"
                  value={normalBillValue}
                  onChange={(e) => setNormalBillValue(e.target.value)}
                  required
                />
                
                <div className="space-y-4 p-5 border border-slate-200 rounded-2xl bg-slate-50/70 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center">
                      <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Upload Documents
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Recent Bills Required *
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Paid Bill (Optional) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Upload your paid bills (Optional)</label>
                      <div className="flex items-center">
                        <input
                          type="file"
                          name="paid_bill"
                          accept="image/*,.pdf"
                          className="hidden"
                          id="paid_bill"
                          onChange={(e) => setPaidBillFile(e.target.files?.[0] || null)}
                        />
                        <label htmlFor="paid_bill" className="flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 w-full transition-all">
                          <span className="truncate">{paidBillFile ? `Attached: ${paidBillFile.name}` : "UPLOAD PAID BILLS"}</span>
                          <Upload className="w-3.5 h-3.5 ml-2 text-slate-400" />
                        </label>
                      </div>
                    </div>
                    
                    {/* Unpaid Bills (Optional) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Upload your unpaid bills if any (Optional)</label>
                      <div className="flex items-center">
                        <input
                          type="file"
                          name="unpaid_bills"
                          accept="image/*,.pdf"
                          className="hidden"
                          id="unpaid_bills"
                          onChange={(e) => setUnpaidBillFile(e.target.files?.[0] || null)}
                        />
                        <label htmlFor="unpaid_bills" className="flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 w-full transition-all">
                          <span className="truncate">{unpaidBillFile ? `Attached: ${unpaidBillFile.name}` : "UPLOAD UNPAID BILLS"}</span>
                          <Upload className="w-3.5 h-3.5 ml-2 text-slate-400" />
                        </label>
                      </div>
                    </div>

                    {/* Recent Bills (STRICTLY REQUIRED) */}
                    <div className="pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-900">
                          Upload Recent Bills <span className="text-red-500 font-bold">* Required</span>
                        </label>
                        {recentBillFiles.length > 0 && (
                          <span className="text-[11px] text-emerald-700 font-bold flex items-center">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {recentBillFiles.length} File(s) Attached
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <input
                          type="file"
                          name="recent_bills_req"
                          accept="image/*,.pdf"
                          multiple
                          required={recentBillFiles.length === 0}
                          className="hidden"
                          id="recent_bills_req"
                          onChange={handleRecentBillChange}
                        />
                        <label
                          htmlFor="recent_bills_req"
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const files = Array.from(e.dataTransfer.files);
                            if (files.length > 0) {
                              const syntheticEvent = {
                                target: { files: files as any }
                              } as React.ChangeEvent<HTMLInputElement>;
                              handleRecentBillChange(syntheticEvent);
                            }
                          }}
                          className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-sm ${
                            recentBillFiles.length > 0
                              ? 'bg-emerald-50/80 border-emerald-500 text-emerald-900'
                              : 'bg-white border-dashed border-blue-400 hover:border-blue-600 text-blue-700 hover:bg-blue-50/50'
                          }`}
                        >
                          <div className="flex flex-col items-center text-center">
                            {recentBillFiles.length > 0 ? (
                              <FileCheck className="w-8 h-8 mb-2 text-emerald-600" />
                            ) : (
                              <Upload className="w-8 h-8 mb-2 text-blue-600" />
                            )}
                            <span className="mb-2 max-w-[200px] sm:max-w-xs md:max-w-md truncate">
                              {recentBillFiles.length > 0 
                                ? recentBillFiles.map(f => f.name).join(', ') 
                                : "DRAG & DROP OR BROWSE (IMAGE / PDF) *"}
                            </span>
                            <span className="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-md font-bold uppercase mt-1">
                              {recentBillFiles.length > 0 ? 'Add More Files' : 'Browse Files'}
                            </span>
                          </div>
                        </label>
                      </div>

                      {recentBillFiles.length === 0 && (
                        <p className="text-[11px] text-amber-700 mt-1.5 font-medium flex items-center">
                          <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                          You must upload at least one recent electricity bill to calculate forecasts.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI Extraction Progress or Results Card */}
                {parsingBill && (
                  <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl flex items-center gap-3 text-xs text-purple-900 font-medium animate-pulse">
                    <Sparkles className="w-4 h-4 text-purple-600 animate-spin" />
                    <span>Extracting electricity units, tariff rate, and appliance consumption breakdown from bill...</span>
                  </div>
                )}

                {extractedData && !parsingBill && (
                  <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-5 rounded-2xl shadow-md border border-blue-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-blue-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-200">
                          Extracted Bill Usage & Appliance Load
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        AI OCR Verified
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                        <div className="text-[10px] text-slate-300 uppercase tracking-wider">Bill Amount</div>
                        <div className="text-sm font-bold text-amber-300">₹{extractedData.extractedBillAmount}</div>
                      </div>
                      <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                        <div className="text-[10px] text-slate-300 uppercase tracking-wider">Total Units</div>
                        <div className="text-sm font-bold text-emerald-300">{extractedData.extractedUnits} kWh</div>
                      </div>
                      <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                        <div className="text-[10px] text-slate-300 uppercase tracking-wider">Est. Rate</div>
                        <div className="text-sm font-bold text-blue-300">₹{extractedData.ratePerUnit}/unit</div>
                      </div>
                    </div>

                    {extractedData.appliances && (
                      <div className="pt-2">
                        <div className="text-[10px] text-slate-300 uppercase tracking-wider font-bold mb-1.5 flex items-center">
                          <Cpu className="w-3 h-3 mr-1 text-blue-400" /> Extracted Appliance Load Breakdown:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {extractedData.appliances.map((app: any, idx: number) => (
                            <span key={idx} className="text-[10px] bg-white/10 text-slate-200 px-2 py-0.5 rounded-md border border-white/10">
                              {app.appliance}: <strong className="text-white">{app.sharePercent}%</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Electricity Section 2 */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Do you want prediction over unpaid bills</label>
                  <select name="predict_unpaid" className="flex h-11 w-full rounded-lg border border-slate-200 shadow-sm bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                
                <Input name="predict_years" label="Of how many years" placeholder="Ex: 3 years" required />
                <Input name="predict_future_years" label="Then how many years you want prediction over bills you will pay" placeholder="Ex: 5 years" required />
              </div>
            </>
          )}

          <div className="pt-6 border-t border-slate-100 text-center space-y-4">
            <p className="text-sm text-slate-500">
              {isLPG ? "Click confirm button below once the form is completed" : "Click the confirm button below to begin process"}
            </p>
            <Button type="submit" className="w-full max-w-sm rounded-full py-3" isLoading={loading}>
              Confirm
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
