export const DISH_BASE_KG_PER_PERSON = {
  Dal: 0.21,
  Tadka: 0.538,
  Chapatis: 0.394,
  "Sukhi Sabzi": 0.27,
  "Tari Sabzi": 0.228,
  Rice: 0.186,
  Chai: 0.296,
};

export interface DishProfileItem {
  dish: string;
  baseKg: number;
  degree: string;
}

export const STATE_DISH_PROFILES: Record<string, DishProfileItem[]> = {
  "Punjab": [
    { dish: "Dal Makhani / Chana", baseKg: 0.21, degree: "107.5°C" },
    { dish: "Tandoori Roti / Paratha", baseKg: 0.538, degree: "225°C" },
    { dish: "Paneer / Sabzi", baseKg: 0.394, degree: "180°C" },
    { dish: "Kadhi Pakora", baseKg: 0.27, degree: "110°C" },
    { dish: "Rajma", baseKg: 0.228, degree: "105°C" },
    { dish: "Rice / Jeera Rice", baseKg: 0.186, degree: "100°C" },
    { dish: "Masala Chai", baseKg: 0.296, degree: "97.5°C" },
  ],
  "Maharashtra": [
    { dish: "Varan / Amti", baseKg: 0.21, degree: "105°C" },
    { dish: "Tadka / Phodni", baseKg: 0.538, degree: "180°C" },
    { dish: "Poli / Bhakri", baseKg: 0.394, degree: "220°C" },
    { dish: "Sukhi Sabzi (Bhawji)", baseKg: 0.27, degree: "150°C" },
    { dish: "Pithla / Misal Gravy", baseKg: 0.228, degree: "110°C" },
    { dish: "Bhat (Rice)", baseKg: 0.186, degree: "100°C" },
    { dish: "Chai", baseKg: 0.296, degree: "97.5°C" },
  ],
  "Tamil Nadu": [
    { dish: "Sambar / Rasam", baseKg: 0.21, degree: "105°C" },
    { dish: "Tadka / Tempering", baseKg: 0.538, degree: "180°C" },
    { dish: "Dosa / Parotta / Chapati", baseKg: 0.394, degree: "220°C" },
    { dish: "Poriyal / Kootu", baseKg: 0.27, degree: "140°C" },
    { dish: "Kuzhambu (Gravy)", baseKg: 0.228, degree: "110°C" },
    { dish: "Steamed Rice", baseKg: 0.186, degree: "100°C" },
    { dish: "Filter Coffee / Tea", baseKg: 0.296, degree: "95°C" },
  ],
  "Gujarat": [
    { dish: "Gujarati Dal / Kadhi", baseKg: 0.21, degree: "108°C" },
    { dish: "Vaghar (Tadka)", baseKg: 0.538, degree: "180°C" },
    { dish: "Rotli / Rotla", baseKg: 0.394, degree: "225°C" },
    { dish: "Shaak (Sukhi Sabzi)", baseKg: 0.27, degree: "150°C" },
    { dish: "Rasawalo Shaak / Undhiyu", baseKg: 0.228, degree: "120°C" },
    { dish: "Bhat / Khichdi", baseKg: 0.186, degree: "100°C" },
    { dish: "Masala Chai", baseKg: 0.296, degree: "97.5°C" },
  ],
  "West Bengal": [
    { dish: "Tok Dal / Cholar Dal", baseKg: 0.21, degree: "107.5°C" },
    { dish: "Phoron (Tadka)", baseKg: 0.538, degree: "180°C" },
    { dish: "Luchi / Roti", baseKg: 0.394, degree: "220°C" },
    { dish: "Bhaja / Shukto", baseKg: 0.27, degree: "140°C" },
    { dish: "Machher Jhol / Curry", baseKg: 0.228, degree: "110°C" },
    { dish: "Bhat (Rice)", baseKg: 0.186, degree: "100°C" },
    { dish: "Milk Tea", baseKg: 0.296, degree: "98°C" },
  ],
  "Default": [
    { dish: "Dal", baseKg: 0.21, degree: "107.5°C" },
    { dish: "Tadka", baseKg: 0.538, degree: "180°C" },
    { dish: "Chapatis", baseKg: 0.394, degree: "225°C" },
    { dish: "Sukhi Sabzi", baseKg: 0.27, degree: "150°C" },
    { dish: "Tari Sabzi", baseKg: 0.228, degree: "100°C" },
    { dish: "Rice", baseKg: 0.186, degree: "100°C" },
    { dish: "Chai", baseKg: 0.296, degree: "97.5°C" },
  ]
};

export function getDishProfileForState(userState?: string): DishProfileItem[] {
  if (!userState) return STATE_DISH_PROFILES["Default"];
  const cleanState = userState.trim().toLowerCase();
  for (const [key, list] of Object.entries(STATE_DISH_PROFILES)) {
    if (key.toLowerCase() === cleanState || cleanState.includes(key.toLowerCase())) {
      return list;
    }
  }
  return STATE_DISH_PROFILES["Default"];
}

export const REFERENCE_CYLINDER_KG = 27.8;

export function predictLpg({
  kgPerCylinder,
  cylindersBought,
  pricePaid,
  familyMembers,
  separateCylinderUsers = 0,
  daysPerCylinder,
  predictionYears = 1,
  wantSeparatePrediction = false,
}: {
  kgPerCylinder: number;
  cylindersBought: number;
  pricePaid: number;
  familyMembers: number;
  separateCylinderUsers?: number;
  daysPerCylinder?: number;
  predictionYears?: number;
  wantSeparatePrediction?: boolean;
}) {
  const pricePerCylinder = cylindersBought ? pricePaid / cylindersBought : pricePaid;
  const costPerKg = pricePerCylinder / kgPerCylinder;

  let reported = null;
  if (daysPerCylinder) {
    const dailyKgReported = kgPerCylinder / daysPerCylinder;
    const dailyCostReported = dailyKgReported * costPerKg;
    reported = {
      daily_kg: Number(dailyKgReported.toFixed(3)),
      daily_loss: Number(dailyCostReported.toFixed(2)),
      projected_1_year_loss: Number((dailyCostReported * 365).toFixed(2)),
      multi_year_projection: Number((dailyCostReported * 365 * predictionYears).toFixed(2)),
      basis: "Your own reported refill cost and cylinder lifespan.",
    };
  }

  const effectiveMembers = Math.max(1, familyMembers - separateCylinderUsers);
  const dishDailyKgPerPerson = Object.values(DISH_BASE_KG_PER_PERSON).reduce((a, b) => a + b, 0);
  
  const modeledDailyKg = dishDailyKgPerPerson * effectiveMembers * (kgPerCylinder / REFERENCE_CYLINDER_KG);
  const modeledDailyCost = modeledDailyKg * costPerKg;
  
  const modeled = {
    daily_kg: Number(modeledDailyKg.toFixed(3)),
    daily_loss: Number(modeledDailyCost.toFixed(2)),
    projected_1_year_loss: Number((modeledDailyCost * 365).toFixed(2)),
    multi_year_projection: Number((modeledDailyCost * 365 * predictionYears).toFixed(2)),
    basis: `Typical dish-by-dish consumption for a ${effectiveMembers}-person household (from LPG_usage_cost.xlsx), scaled to a ${kgPerCylinder}kg cylinder.`,
  };

  let separate_prediction = null;
  if (wantSeparatePrediction || separateCylinderUsers > 0) {
    const sepMembers = separateCylinderUsers > 0 ? separateCylinderUsers : 1;
    const sepDailyKg = dishDailyKgPerPerson * sepMembers * (kgPerCylinder / REFERENCE_CYLINDER_KG);
    const sepDailyCost = sepDailyKg * costPerKg;
    const sepDaysPerCylinder = sepDailyKg > 0 ? kgPerCylinder / sepDailyKg : 0;
    const sepCylindersPerYear = sepDailyKg > 0 ? (sepDailyKg * 365) / kgPerCylinder : 0;

    separate_prediction = {
      members: sepMembers,
      cost_per_kg: Number(costPerKg.toFixed(2)),
      price_per_cylinder: Number(pricePerCylinder.toFixed(2)),
      kg_per_cylinder: kgPerCylinder,
      daily_kg: Number(sepDailyKg.toFixed(3)),
      daily_loss: Number(sepDailyCost.toFixed(2)),
      projected_1_year_loss: Number((sepDailyCost * 365).toFixed(2)),
      multi_year_projection: Number((sepDailyCost * 365 * predictionYears).toFixed(2)),
      days_per_cylinder: Number(sepDaysPerCylinder.toFixed(1)),
      cylinders_per_year: Number(sepCylindersPerYear.toFixed(1)),
      basis: `Separate usage calculation for ${sepMembers} member(s) using separate cylinder(s), at average LPG rate ₹${costPerKg.toFixed(2)}/kg.`,
    };
  }

  return {
    inputs: { kgPerCylinder, cylindersBought, pricePaid, familyMembers, separateCylinderUsers, daysPerCylinder, predictionYears, wantSeparatePrediction },
    cost_per_kg: Number(costPerKg.toFixed(2)),
    price_per_cylinder: Number(pricePerCylinder.toFixed(2)),
    reported,
    modeled,
    separate_prediction,
    prediction_years: predictionYears,
  };
}

export function predictElectricity({
  normalBill,
  unpaidBillAmount = 0,
  predictionYears = 1,
  totalUnits,
  billingDays = 30,
  ratePerUnit,
  customAppliances,
  uploadedFileName,
}: {
  normalBill: number;
  unpaidBillAmount?: number;
  predictionYears?: number;
  totalUnits?: number;
  billingDays?: number;
  ratePerUnit?: number;
  customAppliances?: any[];
  uploadedFileName?: string;
}) {
  const computedTotalUnits = totalUnits && totalUnits > 0 ? totalUnits : (normalBill / (ratePerUnit || 7.5));
  const computedRate = ratePerUnit && ratePerUnit > 0 ? ratePerUnit : (normalBill / (computedTotalUnits || 1));
  
  const dailyTotalBill = normalBill / (billingDays || 30);
  const dailyTotalUnits = computedTotalUnits / (billingDays || 30);

  const appliances = customAppliances && customAppliances.length > 0 ? customAppliances : DEFAULT_ELECTRICITY_APPLIANCES;

  const applianceBreakdown = appliances.map((item) => {
    const share = item.sharePercent || 10;
    const dailyCost = dailyTotalBill * (share / 100);
    const dailyUnits = dailyTotalUnits * (share / 100);
    const monthlyUnits = computedTotalUnits * (share / 100);
    const monthlyCost = normalBill * (share / 100);
    const yrLoss = dailyCost * 365 * predictionYears;

    return {
      appliance: item.appliance,
      category: item.category || 'General',
      powerRating: item.powerRating || '500W',
      sharePercent: share,
      dailyUnits: Number(dailyUnits.toFixed(3)),
      monthlyUnits: Number(monthlyUnits.toFixed(1)),
      dailyCost: Number(dailyCost.toFixed(2)),
      monthlyCost: Number(monthlyCost.toFixed(2)),
      yrLoss: Number(yrLoss.toFixed(2)),
    };
  });

  const dailyLoss = dailyTotalBill;
  const yearLoss = normalBill * (12 / ((billingDays || 30) / 30));
  const multiYear = (yearLoss * predictionYears) + unpaidBillAmount;

  return {
    inputs: {
      normalBill,
      unpaidBillAmount,
      predictionYears,
      totalUnits: Number(computedTotalUnits.toFixed(1)),
      billingDays,
      ratePerUnit: Number(computedRate.toFixed(2)),
      uploadedFileName: uploadedFileName || 'Recent_Bill.pdf',
    },
    daily_loss: Number(dailyLoss.toFixed(2)),
    projected_1_year_loss: Number(yearLoss.toFixed(2)),
    multi_year_projection: Number(multiYear.toFixed(2)),
    unpaid_bill_amount: Number(unpaidBillAmount.toFixed(2)),
    prediction_years: predictionYears,
    total_units: Number(computedTotalUnits.toFixed(1)),
    rate_per_unit: Number(computedRate.toFixed(2)),
    appliance_breakdown: applianceBreakdown,
    basis: `Extracted electricity usage (${computedTotalUnits.toFixed(0)} units @ ₹${computedRate.toFixed(2)}/unit) from uploaded bill, with itemized appliance load breakdown.`,
  };
}

export const DEFAULT_ELECTRICITY_APPLIANCES = [
  { appliance: "Air Conditioner (1.5 Ton)", category: "Cooling", powerRating: "1500W", sharePercent: 35 },
  { appliance: "Water Heater / Geyser", category: "Heating", powerRating: "2000W", sharePercent: 18 },
  { appliance: "Refrigerator (Double Door)", category: "Refrigeration", powerRating: "250W", sharePercent: 15 },
  { appliance: "Fans & LED Lighting", category: "Lighting & Air", powerRating: "300W", sharePercent: 12 },
  { appliance: "Water Pump / Submersible Motor", category: "Water Supply", powerRating: "750W", sharePercent: 8 },
  { appliance: "TV & Home Electronics", category: "Entertainment", powerRating: "150W", sharePercent: 5 },
  { appliance: "Washing Machine & Ironing", category: "Laundry", powerRating: "500W", sharePercent: 4 },
  { appliance: "Kitchen Appliances (Mixer/Oven)", category: "Cooking", powerRating: "600W", sharePercent: 3 },
];

export function validateExcelEngine() {
  console.log("--- Running Validation Script against LPG_usage_cost.xlsx Hardcoded References ---");
  
  // Exact user inputs from the provided screenshots
  const result = predictLpg({
    kgPerCylinder: 15.4,
    cylindersBought: 1,
    pricePaid: 689,
    familyMembers: 6,
    separateCylinderUsers: 0,
    daysPerCylinder: 15,
    predictionYears: 2
  });

  const expected = {
    costPerKg: 44.74,
    modeledDailyKg: 7.053,
    modeledDailyCost: 315.55,
    modeled1Year: 115176.55,
    modeledMultiYear: 230353.11,
    reportedDailyKg: 1.027,
    reportedDailyCost: 45.93,
    reported1Year: 16765.67,
    reportedMultiYear: 33531.34
  };

  console.log("\nValidation Results (Actual Engine Float output vs Expected PDF output):");
  
  const check = (name: string, actual: any, exp: any) => {
    const diff = Math.abs(actual - exp);
    if (diff < 0.02) {
      console.log(`✅ [MATCH] ${name}: Engine=${actual} | Target=${exp}`);
    } else {
      console.error(`❌ [MISMATCH] ${name}: Engine=${actual} | Target=${exp} | Diff=${diff.toFixed(4)}`);
    }
  };

  check("Cost per KG", result.cost_per_kg, expected.costPerKg);
  check("Modeled Daily KG", result.modeled.daily_kg, expected.modeledDailyKg);
  check("Modeled Daily Cost", result.modeled.daily_loss, expected.modeledDailyCost);
  check("Modeled 1 Year", result.modeled.projected_1_year_loss, expected.modeled1Year);
  check("Modeled Multi Year", result.modeled.multi_year_projection, expected.modeledMultiYear);

  if (result.reported) {
    check("Reported Daily KG", result.reported.daily_kg, expected.reportedDailyKg);
    check("Reported Daily Cost", result.reported.daily_loss, expected.reportedDailyCost);
    check("Reported 1 Year", result.reported.projected_1_year_loss, expected.reported1Year);
    check("Reported Multi Year", result.reported.multi_year_projection, expected.reportedMultiYear);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  validateExcelEngine();
}
