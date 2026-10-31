const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const storeService = require('../src/services/store.service');
const feedbackService = require('../src/services/feedback.service');
const issueService = require('../src/services/issue.service');
const csvService = require('../src/services/csv.service');
const { CATEGORIES, PRIORITIES, ISSUE_STATUSES, OWNER_TEAMS, PROVENANCES } = require('../src/constants/enums');

async function seed() {
  console.log('--- StoreGrid Seed Runner ---');
  await db.initDb();

  const dbStatus = db.getDbStatus();
  console.log(`Database connected in ${dbStatus.mode.toUpperCase()} mode.`);

  // 1. Seed Stores
  console.log('Seeding stores...');
  const initialStores = [
    {
      code: 'STR-HYD-001',
      name: 'StoreGrid Banjara Hills',
      region: 'Telangana',
      city: 'Hyderabad',
      address: 'Road No. 12, Banjara Hills, Hyderabad, 500034',
    },
    {
      code: 'STR-VIZ-002',
      name: 'StoreGrid Beach Road',
      region: 'Andhra Pradesh',
      city: 'Visakhapatnam',
      address: 'RK Beach Road, Pandurangapuram, Visakhapatnam, 530003',
    },
    {
      code: 'STR-VJA-003',
      name: 'StoreGrid Benz Circle',
      region: 'Andhra Pradesh',
      city: 'Vijayawada',
      address: 'MG Road, Benz Circle, Vijayawada, 520010',
    },
    {
      code: 'STR-GNT-004',
      name: 'StoreGrid Brodipet',
      region: 'Andhra Pradesh',
      city: 'Guntur',
      address: '4th Lane, Brodipet, Guntur, 522002',
    },
    {
      code: 'STR-TPT-005',
      name: 'StoreGrid Alipiri Road',
      region: 'Andhra Pradesh',
      city: 'Tirupati',
      address: 'Alipiri Bypass Road, Tirupati, 517501',
    },
  ];

  const storesMap = {};
  for (const st of initialStores) {
    let existing = await storeService.getStoreByCode(st.code);
    if (!existing) {
      existing = await storeService.createStore(st);
      console.log(`Created store: ${st.code} - ${st.name}`);
    } else {
      console.log(`Store already exists: ${st.code}`);
    }
    storesMap[st.code] = existing;
  }

  // 2. Import Synthetic CSV Feedback (Record-level idempotent: safely handles partially or fully seeded DBs)
  console.log('\nImporting synthetic feedback from data/synthetic_feedback.csv with duplicate prevention...');
  const csvPath = path.join(__dirname, '../data/synthetic_feedback.csv');
  if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const result = await csvService.parseAndImportCsv(csvContent, {
      provenance: PROVENANCES.SYNTHETIC_DEMO,
      skipDuplicates: true,
    });
    console.log(
      `CSV Import Result: ${result.importedCount} new records imported, ${result.skippedCount || 0} existing records skipped, ${result.failedCount} failures.`
    );
  } else {
    console.warn(`CSV file not found at ${csvPath}`);
  }

  // 3. Seed Sample Issues linked to Feedback (Idempotent: prevents duplicate issue records)
  console.log('\nSeeding sample issues for dashboard demonstration...');

  async function findOrCreateSeedIssue(issueData) {
    const existing = await db.query(
      'SELECT id, title, status FROM issues WHERE store_id = $1 AND title = $2 LIMIT 1;',
      [issueData.storeId, issueData.title]
    );
    if (existing.rows.length > 0) {
      console.log(`Issue already exists: [${issueData.priority}] ${issueData.title}`);
      return existing.rows[0];
    }
    const created = await issueService.createIssue(issueData);
    console.log(`Created Issue: [${created.priority}] ${created.title} (${created.status})`);
    return created;
  }

  // Issue 1: Severe HVAC and Freezer breakdown spike at Banjara Hills
  const hydStore = storesMap['STR-HYD-001'];
  const hydFeedback = await feedbackService.listFeedback({ storeId: hydStore.id, limit: 10 });
  const hydHvacFb = hydFeedback.data.filter((f) => f.detectedCategory === CATEGORIES.EQUIPMENT_FAILURE);

  await findOrCreateSeedIssue({
    storeId: hydStore.id,
    title: 'Severe HVAC Chiller Failure & Display Freezer Leakage',
    description:
      'Store AC completely failed on afternoon of Oct 15 during temperature spike, combined with frozen foods freezer unit leaking water onto aisle.',
    category: CATEGORIES.EQUIPMENT_FAILURE,
    priority: PRIORITIES.CRITICAL,
    status: ISSUE_STATUSES.IN_PROGRESS,
    ownerTeam: OWNER_TEAMS.FACILITIES_MAINTENANCE,
    assignedTo: 'Ramesh HVAC Tech',
    dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    linkedFeedbackIds: hydHvacFb.map((f) => f.id),
    createdBy: 'Vinay (Lead)',
  });

  // Issue 2: Billing delay spike at Counter 2 & 4
  const hydBillingFb = hydFeedback.data.filter((f) => f.detectedCategory === CATEGORIES.BILLING_DELAY);
  await findOrCreateSeedIssue({
    storeId: hydStore.id,
    title: 'POS Terminal Freeze and Barcode Scanner Failures',
    description: 'Consecutive failures at checkout counters causing extreme queues over 25 minutes during peak hours.',
    category: CATEGORIES.BILLING_DELAY,
    priority: PRIORITIES.HIGH,
    status: ISSUE_STATUSES.OPEN,
    ownerTeam: OWNER_TEAMS.BILLING_TECH,
    assignedTo: 'Kiran POS Engineer',
    dueDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    linkedFeedbackIds: hydBillingFb.map((f) => f.id),
    createdBy: 'Vinay (Lead)',
  });

  // Issue 3: Stock shortage in Dairy and Edible Oils
  const hydStockFb = hydFeedback.data.filter((f) => f.detectedCategory === CATEGORIES.STOCK_SHORTAGE);
  await findOrCreateSeedIssue({
    storeId: hydStore.id,
    title: 'Sunflower Oil & Fresh Milk Depletion',
    description: 'Aisle 3 sunflower oil and morning dairy supplies empty for multiple days.',
    category: CATEGORIES.STOCK_SHORTAGE,
    priority: PRIORITIES.MEDIUM,
    status: ISSUE_STATUSES.OPEN,
    ownerTeam: OWNER_TEAMS.INVENTORY,
    assignedTo: 'Suresh Inventory Mgr',
    dueDate: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    linkedFeedbackIds: hydStockFb.map((f) => f.id),
    createdBy: 'Vinay (Lead)',
  });

  // Issue 4: Resolved Staff Escalation at Vijayawada
  const vjaStore = storesMap['STR-VJA-003'];
  const vjaFeedback = await feedbackService.listFeedback({ storeId: vjaStore.id, limit: 10 });
  const vjaStaffFb = vjaFeedback.data.filter((f) => f.detectedCategory === CATEGORIES.STAFF_BEHAVIOUR);

  const issue4 = await findOrCreateSeedIssue({
    storeId: vjaStore.id,
    title: 'Cashier Conduct & Customer Etiquette Escalation',
    description: 'Reports of cashier behaving rudely during peak checkout rush.',
    category: CATEGORIES.STAFF_BEHAVIOUR,
    priority: PRIORITIES.MEDIUM,
    status: ISSUE_STATUSES.OPEN,
    ownerTeam: OWNER_TEAMS.HR_TRAINING,
    assignedTo: 'Ananya HR Lead',
    linkedFeedbackIds: vjaStaffFb.map((f) => f.id),
    createdBy: 'Vinay (Lead)',
  });

  // Resolve it to test status transition if not already resolved
  if (issue4.status !== ISSUE_STATUSES.RESOLVED) {
    const resolvedIssue4 = await issueService.updateIssueStatus(issue4.id, {
      status: ISSUE_STATUSES.RESOLVED,
      resolutionNotes: 'Conducted customer courtesy refresher workshop and reassigned cashier to inventory restocking.',
      changedBy: 'Vinay (Lead)',
    });
    console.log(`Created & Resolved Issue: ${resolvedIssue4.title} -> ${resolvedIssue4.status}`);
  }

  console.log('\n--- Seeding Complete Successfully ---');
  await db.closeDb();
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}

module.exports = seed;
