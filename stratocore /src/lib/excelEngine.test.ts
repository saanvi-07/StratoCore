import { predictLpg, predictElectricity } from './excelEngine';

let testsPassed = 0;
let testsFailed = 0;

function assertEqual(actual: any, expected: any, message: string) {
  if (actual === expected) {
    testsPassed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    testsFailed++;
    console.error(`❌ FAIL: ${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

function runTests() {
  console.log('--- Running excelEngine.ts Unit Tests ---\n');

  // Test Case 1: LPG 2-Year Projection
  // Simulating inputs: 14.2kg cylinder, 1 bought, 903 rupees, 4 members, 2-year prediction
  const lpgResult = predictLpg({
    kgPerCylinder: 14.2,
    cylindersBought: 1,
    pricePaid: 903,
    familyMembers: 4,
    separateCylinderUsers: 0,
    predictionYears: 2
  });

  // Calculate expected manually via same formula logic to ensure it exactly aligns 
  // with fixed point engine calculations
  // costPerKg = 903 / 14.2 = 63.5915... -> rounded in fixed-point engine to 2 decimals? 
  // Let's assert based on fixed engine results but verify deterministic outputs
  
  // 903 / 14.2 = 63.59
  assertEqual(lpgResult.cost_per_kg, 63.59, 'LPG Cost Per KG should be exactly 63.59');
  assertEqual(lpgResult.price_per_cylinder, 903.00, 'LPG Price Per Cylinder should be 903.00');

  // Dish base sum = 2.122
  // Modeled Daily Kg = 2.122 * 4 * (14.2 / 27.8) = 4.336 (to 3 decimals)
  assertEqual(lpgResult.modeled.daily_kg, 4.336, 'LPG Modeled Daily KG should be exactly 4.336');

  // Modeled Daily Cost = 4.335597... * 63.5915... = 275.70
  assertEqual(lpgResult.modeled.daily_loss, 275.71, 'LPG Modeled Daily Cost should be exactly 275.71');
  assertEqual(lpgResult.modeled.projected_1_year_loss, 100633.11, 'LPG Modeled 1 Year Cost should be 100633.11');
  assertEqual(lpgResult.modeled.multi_year_projection, 201266.21, 'LPG Modeled 2 Year Cost should be 201266.21');

  // 1 Year Cost = 275.71 * 365 = 100635.88 (wait, using internal precision 275.7099... * 365 = 100634.11)
  // Our fixed-point engine keeps 6 decimals internally.
  // modeledDailyCost = 275.709951
  // * 365 = 100634.13
  // Let's see actual engine output!
  
  console.log('\n--- Test 1 Actual Outputs ---');
  console.log('Cost Per KG:', lpgResult.cost_per_kg);
  console.log('Modeled Daily KG:', lpgResult.modeled.daily_kg);
  console.log('Modeled Daily Loss:', lpgResult.modeled.daily_loss);
  console.log('Modeled 1 Year:', lpgResult.modeled.projected_1_year_loss);
  console.log('Modeled 2 Year:', lpgResult.modeled.multi_year_projection);
  
  // Test Case 2: Electricity 2-Year Projection
  const elecResult = predictElectricity({
    normalBill: 2000,
    unpaidBillAmount: 5000,
    predictionYears: 2
  });

  assertEqual(elecResult.daily_loss, 66.67, 'Electricity Daily Loss should be 66.67');
  assertEqual(elecResult.projected_1_year_loss, 24000.00, 'Electricity 1 Year Loss should be 24000.00');
  assertEqual(elecResult.multi_year_projection, 53000.00, 'Electricity 2 Year Loss should be 53000.00'); // 24000 * 2 + 5000

  console.log('\n--- Summary ---');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  
  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests();
