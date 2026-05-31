import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, addDoc, updateDoc, collection, onSnapshot, getDocs, getDoc, query, where, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBViM31sQzeaZzSAUSevpaNuBbHSaFXHvk",
  authDomain: "atralos.firebaseapp.com",
  projectId: "atralos",
  storageBucket: "atralos.firebasestorage.app",
  messagingSenderId: "117722473031",
  appId: "1:117722473031:web:30f9af23dac27bae880762",
  measurementId: "G-YEEY8E2DWW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Mock api object mimicking the Convex-generated API to preserve all call sites
const api = {
  db: {
    // Queries
    getPatients: "patients",
    getAppointments: "appointments",
    getClinicalRecords: "clinicalRecords",
    getInvestigations: "investigations",
    getBillingInvoices: "billingInvoices",
    getAuditLogs: "auditLogs",
    getStaffAccounts: "staffAccounts",
    getVitals: "vitals",
    getDevices: "devices",
    getComplaints: "complaints",
    getNotifications: "notifications",
    
    // Mutations
    upsertPatient: "patients",
    upsertAuditLog: "auditLogs",
    upsertStaffAccount: "staffAccounts",
    upsertAppointment: "appointments",
    upsertVitals: "vitals",
    upsertInvestigation: "investigations",
    upsertClinicalRecord: "clinicalRecords",
    upsertBillingInvoice: "billingInvoices",
    upsertDevice: "devices",
    upsertComplaint: "complaints",
    upsertNotification: "notifications"
  }
};

// Mock convex client redirecting queries/mutations to Cloud Firestore
const convex = {
  mutation: async (collectionName, data) => {
    if (collectionName === "seedDatabases") {
      // Legacy seeding call bypassed in favor of bootstrap database
      return;
    }
    if (!data.id) {
      const docRef = doc(collection(db, collectionName));
      data.id = docRef.id;
      await setDoc(docRef, data);
    } else {
      await setDoc(doc(db, collectionName, data.id), data, { merge: true });
    }
    return data.id;
  },
  
  onUpdate: (collectionName, args, callback) => {
    return onSnapshot(collection(db, collectionName), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push(doc.data());
      });
      callback(list);
    });
  }
};

// Admin staff registration helper avoiding Admin signout via secondary Firebase App
async function registerUserWithFirebase(email, password) {
  const tempApp = initializeApp(firebaseConfig, "TempApp_" + Date.now());
  const tempAuth = getAuth(tempApp);
  try {
    const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
    await tempApp.delete();
    return userCredential.user;
  } catch (error) {
    try { await tempApp.delete(); } catch(e) {}
    throw error;
  }
}

// ==========================================
// PII CRYPTOGRAPHY SYSTEM (AES-GCM-256 Compliance)
// ==========================================
let piiCryptoKey = null;
let piiMasterPassphrase = "AuratralHospitalOSSecurePIIKey2026!";

async function initPiiCrypto() {
  try {
    const enc = new TextEncoder();
    const rawKey = enc.encode(piiMasterPassphrase);
    const hash = await crypto.subtle.digest("SHA-256", rawKey);
    piiCryptoKey = await crypto.subtle.importKey(
      "raw",
      hash,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (e) {
    console.error("PII Crypto initialization failed:", e);
  }
}

async function encryptText(text) {
  if (!text) return "";
  if (!piiCryptoKey) await initPiiCrypto();
  try {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      piiCryptoKey,
      enc.encode(text)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    let binary = "";
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error("Encryption error:", err);
    return text;
  }
}

async function decryptText(base64Str) {
  if (!base64Str) return "";
  try {
    const decoded = atob(base64Str);
    if (!piiCryptoKey) await initPiiCrypto();
    const combined = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      combined[i] = decoded.charCodeAt(i);
    }
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const dec = new TextDecoder();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      piiCryptoKey,
      ciphertext
    );
    return dec.decode(decrypted);
  } catch (err) {
    return base64Str;
  }
}

async function encryptPatient(p) {
  return {
    ...p,
    name: await encryptText(p.name),
    dob: await encryptText(p.dob),
    mobile: await encryptText(p.mobile),
    emergency: await encryptText(p.emergency),
    insurance: await encryptText(p.insurance),
    abhaId: p.abhaId ? await encryptText(p.abhaId) : ""
  };
}

async function mutatePatient(patient) {
  const schemaPatient = {
    id: patient.id,
    name: patient.name,
    dob: patient.dob,
    gender: patient.gender,
    mobile: patient.mobile,
    bloodGroup: patient.bloodGroup || "",
    emergency: patient.emergency || "",
    insurance: patient.insurance || "",
    abhaId: patient.abhaId || "",
    consentAcademic: patient.consentAcademic,
    consentCommercial: patient.consentCommercial,
    consentFuture: patient.consentFuture,
    regDate: patient.regDate,
    status: patient.status
  };
  const encrypted = await encryptPatient(schemaPatient);
  return await convex.mutation(api.db.upsertPatient, encrypted);
}

// Dynamic Patient Name and Mobile lookup helpers (compliance de-identification)
function getPatientName(patientId) {
  const patient = STATE.patients.find(p => p.id === patientId);
  return patient ? patient.name : 'Unknown Patient';
}
window.getPatientName = getPatientName;

function getPatientMobile(patientId) {
  const patient = STATE.patients.find(p => p.id === patientId);
  return patient ? patient.mobile : 'N/A';
}
window.getPatientMobile = getPatientMobile;

function renderActivePanel() {
  loadDashboardData();
}
window.renderActivePanel = renderActivePanel;

window.checkInPatient = checkInPatient;
window.selectPatientForVitals = selectPatientForVitals;
window.selectPatientForDoctor = selectPatientForDoctor;
window.selectFinanceBill = selectFinanceBill;

function togglePassphraseVisibility() {
  const el = document.getElementById('sys-crypto-passphrase');
  if (el.type === 'password') {
    el.type = 'text';
  } else {
    el.type = 'password';
  }
}
window.togglePassphraseVisibility = togglePassphraseVisibility;

/**
 * Auratral HealthOS — Core JavaScript Application
 * Client-side State, Controllers, and Department Workflow Logic
 * Version 1.0 (May 2026)
 */

// ==========================================
// 1. GLOBAL STATE & SEED DATA
// ==========================================

const STATE = {
  activeRole: 'admin',
  activePanel: 'admin',
  selectedPatientId: null,
  activeLabOrderId: null,
  activeRadioOrderId: null,
  activePrescriptionId: null,
  activeBillId: null,
  doctorConsult: {
    soapA_Tags: [],
    prescriptionMedicines: []
  },
  patientPWA: {
    isLoggedIn: false,
    otpSent: false,
    otpCode: '',
    mobileNumber: '',
    currentTab: 'home',
    activePatientId: null
  },
  patients: [],
  appointments: [],
  clinicalRecords: [],
  investigations: [],
  billingInvoices: [],
  auditLogs: [],
  vitals: [],
  devices: [],
  complaints: [],
  notifications: []
};

// Seed Databases
const DOCTORS = [
  { id: 'DOC001', name: 'Dr. Vikranth Reddy', dept: 'Cardiology', license: 'MCI-103942', schedule: '09:00 - 13:00' },
  { id: 'DOC002', name: 'Dr. Ananya Sharma', dept: 'General Medicine', license: 'MCI-984021', schedule: '10:00 - 17:00' },
  { id: 'DOC003', name: 'Dr. Sanjay Sen', dept: 'Orthopedics', license: 'MCI-473920', schedule: '14:00 - 19:00' },
  { id: 'DOC004', name: 'Dr. Meera Nair', dept: 'Pediatrics', license: 'MCI-882049', schedule: '09:00 - 15:00' }
];

const STAFF_ACCOUNTS = [
  { id: 'STF001', name: 'Dr. Vikram Aditya', role: 'Super Admin', dept: 'Management', license: 'MCI-224190', status: 'Active' },
  { id: 'STF002', name: 'Kiran G.', role: 'Reception', dept: 'Front Desk', license: 'N/A', status: 'Active' },
  { id: 'STF003', name: 'Sister Prema Pillai', role: 'Nursing', dept: 'Nursing Care', license: 'INC-448201', status: 'Active' },
  { id: 'STF004', name: 'Dr. Rajesh Patel', role: 'Laboratory Manager', dept: 'Pathology', license: 'MCI-559203', status: 'Active' },
  { id: 'STF005', name: 'Dr. Sunita Rao', role: 'Radiologist', dept: 'Imaging', license: 'MCI-602931', status: 'Active' },
  { id: 'STF006', name: 'Amit Verma', role: 'Pharmacist', dept: 'Pharmacy', license: 'PCI-90342', status: 'Active' },
  { id: 'STF007', name: 'Divya Iyer', role: 'Finance Head', dept: 'Billing', license: 'N/A', status: 'Active' }
];

const ICD10_CODES = [
  { code: 'I10', term: 'Essential (primary) hypertension' },
  { code: 'E11.9', term: 'Type 2 diabetes mellitus without complications' },
  { code: 'J06.9', term: 'Acute upper respiratory infection, unspecified' },
  { code: 'M54.5', term: 'Low back pain' },
  { code: 'K21.9', term: 'Gastro-oesophageal reflux disease without esophagitis' },
  { code: 'J45.909', term: 'Unspecified asthma, uncomplicated' },
  { code: 'N39.0', term: 'Urinary tract infection, site not specified' },
  { code: 'I25.10', term: 'Atherosclerotic heart disease of native coronary artery' },
  { code: 'E03.9', term: 'Hypothyroidism, unspecified' },
  { code: 'H10.9', term: 'Unspecified conjunctivitis' }
];

const SERVICE_PRICES = {
  'OPD Consultation': 500,
  'Fasting Blood Sugar': 150,
  'HbA1c': 550,
  'Complete Blood Count': 350,
  'Chest X-Ray PA View': 800,
  'Ultrasound Abdomen & Pelvis': 1200,
  'CT Brain (Plain)': 3500,
  'MRI Spine (Cervical)': 7500,
  'Medication - Paracetamol 650mg': 40,
  'Medication - Metformin 500mg': 120,
  'Medication - Amlodipine 5mg': 90,
  'Medication - Amoxicillin 500mg': 180
};

const SEED_PATIENTS = [
  {
    id: 'AURA-2026-0001',
    name: 'Rajesh Kumar',
    dob: '1984-06-15',
    gender: 'Male',
    mobile: '9876543210',
    bloodGroup: 'O+',
    emergency: 'Sunita Kumar - 9876543211',
    insurance: 'Star Health - POL100329',
    abhaId: 'rajesh.kumar@abdm',
    consentAcademic: true,
    consentCommercial: true,
    consentFuture: true,
    regDate: '2026-05-27T10:00:00Z',
    status: 'OPD Queue'
  },
  {
    id: 'AURA-2026-0002',
    name: 'Priyanka Sen',
    dob: '1992-11-20',
    gender: 'Female',
    mobile: '9123456789',
    bloodGroup: 'B+',
    emergency: 'Deepak Sen - 9123456780',
    insurance: 'HDFC Ergo - POL903214',
    abhaId: 'priyanka@abdm',
    consentAcademic: true,
    consentCommercial: false,
    consentFuture: true,
    regDate: '2026-05-27T11:00:00Z',
    status: 'In Consultation'
  },
  {
    id: 'AURA-2026-0003',
    name: 'Harish Mehta',
    dob: '1959-03-08',
    gender: 'Male',
    mobile: '9001122334',
    bloodGroup: 'A-',
    emergency: 'Alka Mehta - 9001122335',
    insurance: 'N/A',
    abhaId: '',
    consentAcademic: false,
    consentCommercial: false,
    consentFuture: false,
    regDate: '2026-05-27T12:00:00Z',
    status: 'Booked'
  }
];

const SEED_VITALS = [
  {
    id: 'VIT-001',
    patientId: 'AURA-2026-0001',
    bp: '130/85',
    temp: 98.6,
    spo2: 98,
    pulse: 76,
    sugar: 110,
    notes: 'Seeded vital signs',
    timestamp: '2026-05-27T10:00:00Z'
  },
  {
    id: 'VIT-002',
    patientId: 'AURA-2026-0002',
    bp: '118/76',
    temp: 99.2,
    spo2: 99,
    pulse: 82,
    sugar: 95,
    notes: 'Checked in',
    timestamp: '2026-05-27T11:15:00Z'
  },
  {
    id: 'VIT-003',
    patientId: 'AURA-2026-0003',
    bp: '145/95',
    temp: 98.4,
    spo2: 96,
    pulse: 70,
    sugar: 185,
    notes: 'Mild chest tightness complaint',
    timestamp: '2026-05-27T12:00:00Z'
  }
];

const SEED_APPOINTMENTS = [
  { id: 'APT001', patientId: 'AURA-2026-0001', doctorId: 'DOC002', department: 'Cardiology', type: 'OPD Consultation', date: '2026-05-27', time: '10:15', status: 'In Consultation', token: 101 },
  { id: 'APT002', patientId: 'AURA-2026-0002', doctorId: 'DOC001', department: 'General Medicine', type: 'OPD Consultation', date: '2026-05-27', time: '11:30', status: 'Checked In', token: 102 },
  { id: 'APT003', patientId: 'AURA-2026-0003', doctorId: 'DOC002', department: 'Cardiology', type: 'OPD Consultation', date: '2026-05-27', time: '12:45', status: 'Booked', token: 103 }
];

const SEED_INVESTIGATIONS = [
  {
    id: 'INV001',
    patientId: 'AURA-2026-0001',
    doctorId: 'DOC002',
    doctorName: 'Dr. Ananya Sharma',
    type: 'Lab',
    testName: 'Fasting Blood Sugar',
    refRange: '70 - 100 mg/dL',
    status: 'Pending',
    date: '2026-05-27T10:30:00Z'
  },
  {
    id: 'INV002',
    patientId: 'AURA-2026-0001',
    doctorId: 'DOC002',
    doctorName: 'Dr. Ananya Sharma',
    type: 'Radiology',
    testName: 'Chest X-Ray PA View',
    urgency: 'Routine',
    status: 'Pending',
    date: '2026-05-27T10:31:00Z'
  }
];

const SEED_CLINICAL = [
  {
    id: 'REC001',
    patientId: 'AURA-2026-0002',
    doctorId: 'DOC001',
    doctorName: 'Dr. Vikranth Reddy',
    date: '2026-05-27T11:45:00Z',
    s: 'Complains of mild heart palpitations during workouts.',
    o: 'Heart sounds normal. S1, S2 audible. Pulse rhythmic at 82 bpm.',
    a: ['I25.10 - Atherosclerotic heart disease'],
    p: 'Advised CT Angio if symptoms persist. Start low dose aspirin.',
    medicines: [
      { name: 'Medication - Amlodipine 5mg', dose: '1-0-0', freq: 'After meals', duration: '30 Days' }
    ],
    signed: true,
    signee: 'Dr. Vikranth Reddy',
    consentFlag: true
  }
];

// ==========================================
// 2. AUDIT LOG LOGGER
// ==========================================

async function logAudit(actionType, recordId, description) {
  const log = {
    id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    userRole: STATE.activeRole,
    userId: STAFF_ACCOUNTS.find(s => s.role.toLowerCase().includes(STATE.activeRole))?.id || 'PAT-PORTAL',
    userName: STAFF_ACCOUNTS.find(s => s.role.toLowerCase().includes(STATE.activeRole))?.name || 'Patient Portal User',
    actionType,
    recordId,
    description,
    device: navigator.userAgent.slice(0, 40)
  };
  
  try {
    await convex.mutation(api.db.upsertAuditLog, log);
  } catch (err) {
    console.error("Audit logging failed:", err);
  }
}

// ==========================================
// 3. STORAGE & SIMULATION INITIALIZER
// ==========================================

function saveToLocalStorage() {
  // Deprecated: Sync is handled reactively via Convex database mutations
}

let isInitialLoad = true;

window.bootstrapDatabase = async function() {
  showToast("Bootstrapping database with HIPAA/GDPR/DPDPA compliant seed data...", "info");
  
  try {
    // 1. Create Super Admin auth user in Firebase Auth
    try {
      await createUserWithEmailAndPassword(auth, "user@atralos.com", "Admin123");
      showToast("Super Admin auth user created!");
    } catch (authError) {
      if (authError.code === "auth/email-already-in-use") {
        showToast("Super Admin credentials verified.", "info");
      } else {
        throw authError;
      }
    }

    // 2. Seed staffAccounts
    for (const staff of STAFF_ACCOUNTS) {
      const emailMap = {
        STF001: "user@atralos.com",
        STF002: "reception@atralos.com",
        STF003: "nurse@atralos.com",
        STF004: "lab@atralos.com",
        STF005: "radiologist@atralos.com",
        STF006: "pharmacist@atralos.com",
        STF007: "finance@atralos.com"
      };
      const email = emailMap[staff.id] || `${staff.name.toLowerCase().replace(/\s+/g, '')}@atralos.com`;
      await setDoc(doc(db, "staffAccounts", staff.id), {
        ...staff,
        email: email,
        shift: "Morning",
        workDays: "Mon,Tue,Wed,Thu,Fri",
        qualification: staff.role.includes("Dr") || staff.role.includes("Radiologist") ? "MD" : "Diploma",
        specialization: staff.dept,
        phone: "9876543210",
        leaveBalance: 15,
        joiningDate: new Date().toISOString().split('T')[0]
      });
    }

    // Also register doctors in staffAccounts list!
    for (const docObj of DOCTORS) {
      const docEmail = `${docObj.id.toLowerCase()}@atralos.com`;
      await setDoc(doc(db, "staffAccounts", docObj.id), {
        id: docObj.id,
        name: docObj.name,
        role: "Doctor",
        dept: docObj.dept,
        license: docObj.license,
        email: docEmail,
        status: 'Active',
        shift: "Morning",
        workDays: "Mon,Tue,Wed,Thu,Fri",
        qualification: "MD",
        specialization: docObj.dept,
        phone: "9876543210",
        leaveBalance: 15,
        joiningDate: new Date().toISOString().split('T')[0]
      });
      // Try creating their Firebase Auth account
      try {
        await registerUserWithFirebase(docEmail, "Pass123");
      } catch (e) {
        if (e.code !== "auth/email-already-in-use") {
          console.warn("Could not register doctor auth:", docEmail, e);
        }
      }
    }

    // Register all default staff auth accounts
    const defaultStaffAuths = [
      { email: "reception@atralos.com", pass: "Pass123" },
      { email: "nurse@atralos.com", pass: "Pass123" },
      { email: "lab@atralos.com", pass: "Pass123" },
      { email: "radiologist@atralos.com", pass: "Pass123" },
      { email: "pharmacist@atralos.com", pass: "Pass123" },
      { email: "finance@atralos.com", pass: "Pass123" }
    ];
    for (const authUser of defaultStaffAuths) {
      try {
        await registerUserWithFirebase(authUser.email, authUser.pass);
      } catch (e) {
        if (e.code !== "auth/email-already-in-use") {
          console.warn("Could not register staff auth:", authUser.email, e);
        }
      }
    }

    // Seed patients (PII is encrypted client-side)
    for (const p of SEED_PATIENTS) {
      const enc = await encryptPatient(p);
      await setDoc(doc(db, "patients", p.id), enc);
    }

    // Seed appointments (with department mapped)
    for (const a of SEED_APPOINTMENTS) {
      const docObj = DOCTORS.find(d => d.id === a.doctorId);
      const dept = docObj ? docObj.dept : "General";
      await setDoc(doc(db, "appointments", a.id), {
        ...a,
        department: dept,
        investigationStatus: a.investigationStatus || "None"
      });
    }

    // Seed clinical records
    for (const c of SEED_CLINICAL) {
      await setDoc(doc(db, "clinicalRecords", c.id), c);
    }

    // Seed investigations
    for (const i of SEED_INVESTIGATIONS) {
      await setDoc(doc(db, "investigations", i.id), i);
    }

    // Seed vitals
    for (const v of SEED_VITALS) {
      await setDoc(doc(db, "vitals", v.id), v);
    }

    // Seed devices
    for (const d of SEED_DEVICES) {
      await setDoc(doc(db, "devices", d.id), d);
    }

    // Seed complaints
    for (const c of SEED_COMPLAINTS) {
      await setDoc(doc(db, "complaints", c.id), c);
    }

    // Seed initial audit log
    const auditLog = {
      id: 'LOG-INIT',
      timestamp: new Date().toISOString(),
      userRole: 'Super Admin',
      userId: 'STF001',
      userName: 'Dr. Vikram Aditya',
      actionType: 'Create',
      recordId: 'SYS',
      description: 'Firebase Firestore database initialized with secure seed data & default auth credentials',
      device: 'Chrome/Win10'
    };
    await setDoc(doc(db, "auditLogs", auditLog.id), auditLog);

    showToast("Firebase Database bootstrapped successfully!", "success");
    
    // Automatically attempt log in if not logged in
    if (!auth.currentUser) {
      await signInWithEmailAndPassword(auth, "user@atralos.com", "Admin123");
    }
  } catch (error) {
    console.error("Bootstrapping failed:", error);
    showToast("Database seeding failed: " + error.message, "error");
  }
};

async function seedDatabaseFromDemo() {
  await window.bootstrapDatabase();
}

function loadFromStorage() {
  // Setup Convex subscriptions to reactively sync state and redraw UI
  convex.onUpdate(api.db.getPatients, {}, async (data) => {
    const raw = data || [];
    const decrypted = await Promise.all(raw.map(async (p) => ({
      ...p,
      name: await decryptText(p.name),
      dob: await decryptText(p.dob),
      mobile: await decryptText(p.mobile),
      emergency: await decryptText(p.emergency),
      insurance: await decryptText(p.insurance),
      abhaId: p.abhaId ? await decryptText(p.abhaId) : ""
    })));
    STATE.patients = decrypted;
    if (isInitialLoad && STATE.patients.length === 0) {
      isInitialLoad = false;
      await seedDatabaseFromDemo();
      return;
    }
    isInitialLoad = false;
    renderActivePanel();
    initGlobalSearch();
  });

  convex.onUpdate(api.db.getAppointments, {}, (data) => {
    STATE.appointments = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getClinicalRecords, {}, (data) => {
    STATE.clinicalRecords = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getInvestigations, {}, (data) => {
    STATE.investigations = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getBillingInvoices, {}, (data) => {
    STATE.billingInvoices = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getAuditLogs, {}, (data) => {
    STATE.auditLogs = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getStaffAccounts, {}, (data) => {
    if (data && data.length > 0) {
      STAFF_ACCOUNTS.length = 0;
      STAFF_ACCOUNTS.push(...data);
    }
    renderActivePanel();
  });

  convex.onUpdate(api.db.getVitals, {}, (data) => {
    STATE.vitals = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getDevices, {}, (data) => {
    STATE.devices = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getComplaints, {}, (data) => {
    STATE.complaints = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getNotifications, {}, (data) => {
    STATE.notifications = data || [];
    updateNotificationBell();
  });
}

// ==========================================
// 4. TOAST NOTIFICATION UTILITY
// ==========================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// 5. VIEW NAVIGATION & ROLE ROUTING
// ==========================================

const ROLE_NAV_CONFIGS = {
  admin: [
    { title: 'Super Admin Hub', id: 'admin-dashboard', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { title: 'System Settings', id: 'admin-settings', icon: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z', action: 'toggle-settings' }
  ],
  reception: [
    { title: 'Register Patient', id: 'reception-register', icon: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M20 8v6M23 11h-6' },
    { title: 'Book Appointments', id: 'reception-appointments', icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18' }
  ],
  nursing: [
    { title: 'Checked-in Vitals', id: 'nursing-vitals', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' }
  ],
  doctor: [
    { title: 'Clinic Queue', id: 'doctor-queue', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' }
  ],
  lab: [
    { title: 'Lab Investigations', id: 'lab-investigations', icon: 'M18.36 2.24a9 9 0 0 1 0 12.72m-2.82-9.9a6 6 0 0 1 0 8.49M12 9A3 3 0 1 1 12 3a3 3 0 0 1 0 6z' }
  ],
  radiology: [
    { title: 'Radiology Studies', id: 'radiology-imaging', icon: 'M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1M12 7v10M8 12h8' }
  ],
  pharmacy: [
    { title: 'Prescription Fulfill', id: 'pharmacy-fulfill', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' }
  ],
  finance: [
    { title: 'Invoice & TPA claims', id: 'finance-claims', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' }
  ],
  patient: [
    { title: 'Portal Simulator', id: 'patient-mobile', icon: 'M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM12 18h.01' }
  ]
};

function initRouter() {
  const roleSelect = document.getElementById('global-role-select');
  roleSelect.value = STATE.activeRole;

  roleSelect.addEventListener('change', (e) => {
    switchRole(e.target.value);
  });

  // Init default layout
  switchRole(STATE.activeRole);
}

function switchRole(role) {
  STATE.activeRole = role;
  STATE.activePanel = ROLE_NAV_CONFIGS[role][0].id;
  
  // Set UI profiles based on role selection
  const staff = STAFF_ACCOUNTS.find(s => s.role.toLowerCase().includes(role));
  const userInitials = document.getElementById('user-avatar-initials');
  const userDisplayName = document.getElementById('user-display-name');
  const userRoleDisplay = document.getElementById('user-role-display');

  if (role === 'patient') {
    userInitials.textContent = 'PT';
    userDisplayName.textContent = 'Patient Self-Service';
    userRoleDisplay.textContent = 'Portal Access';
  } else if (staff) {
    const initials = staff.name.split(' ').map(n => n[0]).join('');
    userInitials.textContent = initials.slice(0, 2);
    userDisplayName.textContent = staff.name;
    userRoleDisplay.textContent = staff.role;
  }
  
  // Hide settings page if open
  const settingsPage = document.getElementById('page-system-settings');
  if (settingsPage) settingsPage.style.display = 'none';
  
  // Navigate view
  navigateToPanel(STATE.activePanel);
  
  // Reload dashboard elements
  loadDashboardData();
  
  // Immutable trace audit
  logAudit('View', 'SYS', `Switched workspace perspective to: ${role.toUpperCase()}`);
}

function renderSidebarNav() {
  const menu = document.getElementById('sidebar-nav-menu');
  menu.innerHTML = '';
  
  const links = ROLE_NAV_CONFIGS[STATE.activeRole];
  links.forEach(link => {
    const li = document.createElement('li');
    li.className = `nav-item ${STATE.activePanel === link.id ? 'active' : ''}`;
    li.dataset.panel = link.id;
    li.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="${link.icon}"></path></svg>
      <span>${link.title}</span>
    `;
    li.addEventListener('click', () => {
      // Toggle active styling
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      navigateToPanel(link.id);
    });
    menu.appendChild(li);
  });
}

function navigateToPanel(panelId) {

  STATE.activePanel = panelId;
  
  // Hide all panels
  document.querySelectorAll('.role-panel').forEach(panel => {
    panel.style.display = 'none';
  });
  
  // Render titles and layout updates based on panel selection
  const title = document.getElementById('current-panel-title');
  const subtitle = document.getElementById('current-panel-subtitle');
  
  if (STATE.activeRole === 'admin') {
    document.getElementById('role-panel-admin').style.display = 'block';
    title.textContent = 'Super Admin Hub';
    subtitle.textContent = 'Manage staff registry, view DPDP compliance audits, and download data pools.';
  } else if (STATE.activeRole === 'reception') {
    document.getElementById('role-panel-reception').style.display = 'block';
    title.textContent = 'Receptionist Dashboard';
    subtitle.textContent = 'Onboard patient profiles, query and verify ABHA IDs, and issue appointment tokens.';
  } else if (STATE.activeRole === 'nursing') {
    document.getElementById('role-panel-nursing').style.display = 'block';
    title.textContent = 'Inpatient Nursing Station';
    subtitle.textContent = 'Query checking queue, capture vital signs, and update care schedules.';
  } else if (STATE.activeRole === 'doctor') {
    document.getElementById('role-panel-doctor').style.display = 'block';
    title.textContent = 'Clinical Consult Center';
    subtitle.textContent = 'View patient records history, construct SOAP notes, search ICD-10, and e-sign orders.';
  } else if (STATE.activeRole === 'lab') {
    document.getElementById('role-panel-lab').style.display = 'block';
    title.textContent = 'Pathology Laboratory Portal';
    subtitle.textContent = 'Retrieve active test orders, record observed value details, and compile lab reports.';
  } else if (STATE.activeRole === 'radiology') {
    document.getElementById('role-panel-radiology').style.display = 'block';
    title.textContent = 'Radiology Diagnostics';
    subtitle.textContent = 'Examine requested scans, upload DICOM study images, and complete diagnostic findings.';
  } else if (STATE.activeRole === 'pharmacy') {
    document.getElementById('role-panel-pharmacy').style.display = 'block';
    title.textContent = 'Hospital Pharmacy Dispenser';
    subtitle.textContent = 'Review e-prescriptions, dispatch medicines, record generic substitutes, and log inventory.';
  } else if (STATE.activeRole === 'finance') {
    document.getElementById('role-panel-finance').style.display = 'block';
    title.textContent = 'Billing & Insurance Desk';
    subtitle.textContent = 'Review cross-department services, handle TPA pre-authorization claims, and issue GST receipts.';
  } else if (STATE.activeRole === 'patient') {
    document.getElementById('role-panel-patient').style.display = 'block';
    title.textContent = 'Patient Self-Service PWA';
    subtitle.textContent = 'Simulating mobile patient portal via registered phone number OTP verification.';
  }
}

// Load data into active department dashboard
function loadDashboardData() {
  if (STATE.activeRole === 'admin') {
    renderAdminStaff();
    renderAuditLogs();
    document.getElementById('admin-stat-staff').textContent = STAFF_ACCOUNTS.length;
    const patientsEl = document.getElementById('admin-stat-patients');
    if (patientsEl) patientsEl.textContent = STATE.patients.length;
    const hasAbha = STATE.patients.filter(p => p.abhaId).length;
    const rate = STATE.patients.length ? Math.round((hasAbha / STATE.patients.length) * 100) : 0;
    document.getElementById('admin-stat-abha').textContent = `${rate}%`;
  } else if (STATE.activeRole === 'reception') {
    populateDoctorsSelect();
    renderReceptionQueue();
  } else if (STATE.activeRole === 'nursing') {
    renderNursingQueue();
  } else if (STATE.activeRole === 'doctor') {
    renderDoctorQueue();
    initDoctorICD10Autocomplete();
  } else if (STATE.activeRole === 'lab') {
    renderLabQueue();
  } else if (STATE.activeRole === 'radiology') {
    renderRadiologyQueue();
  } else if (STATE.activeRole === 'pharmacy') {
    renderPharmacyQueue();
  } else if (STATE.activeRole === 'finance') {
    renderFinanceQueue();
  } else if (STATE.activeRole === 'patient') {
    renderPatientPortalPWA();
  }
}

// ==========================================
// 6. MODULE: SUPER ADMIN WORKFLOWS
// ==========================================

function renderAdminStaff() {
  const tbody = document.getElementById('admin-staff-table-body');
  tbody.innerHTML = '';
  
  STAFF_ACCOUNTS.forEach(staff => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="text-bold">${staff.name}</span><br><small class="text-muted">ID: ${staff.id}</small></td>
      <td>${staff.role}<br><small class="text-muted">${staff.dept}</small></td>
      <td><code>${staff.license}</code></td>
      <td><span class="status-indicator status-done">${staff.status}</span></td>
      <td>
        <button class="glass-btn glass-btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="openStaffConfigure('${staff.id}')">Configure</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAuditLogs() {
  const viewport = document.getElementById('audit-logs-viewport');
  const actionFilter = document.getElementById('audit-filter-action').value;
  viewport.innerHTML = '';
  
  const filtered = STATE.auditLogs.filter(log => {
    if (actionFilter === 'all') return true;
    return log.actionType === actionFilter;
  });

  if (filtered.length === 0) {
    viewport.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No audits match the action category filter.</p>`;
    return;
  }
  
  filtered.forEach(log => {
    const dateStr = new Date(log.timestamp).toLocaleTimeString();
    const row = document.createElement('div');
    row.className = `audit-log-row ${log.actionType.toLowerCase()}`;
    row.innerHTML = `
      <span class="audit-log-timestamp">${dateStr}</span>
      <span class="audit-log-role text-bold" style="color:var(--primary);">${log.userRole}</span>
      <span class="status-indicator status-active" style="font-size:0.65rem; border:none; padding:2px 6px;">${log.actionType}</span>
      <span>${log.description} <br><small class="text-muted">Target ID: ${log.recordId} | Operator: ${log.userName} (${log.userId})</small></span>
      <span style="font-size:0.7rem; color:var(--text-2); text-align:right;">${log.device}</span>
    `;
    viewport.appendChild(row);
  });
}

// Admin staff adding - toggle inline form
document.getElementById('btn-add-staff').addEventListener('click', () => {
  const form = document.getElementById('admin-staff-create-form');
  if (form) {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

// Confirm add new staff member
document.getElementById('btn-confirm-add-staff').addEventListener('click', async () => {
  const name = document.getElementById('new-staff-name').value.trim();
  const dept = document.getElementById('new-staff-dept').value;
  const role = document.getElementById('new-staff-role').value;
  const license = document.getElementById('new-staff-license').value.trim();
  const email = document.getElementById('new-staff-email').value.trim();
  
  if (!name || !license || !email) {
    showToast('Please fill in Name, License ID, and Email Address.', 'error');
    return;
  }
  
  let newId;
  if (role.toLowerCase().includes('doctor')) {
    newId = 'DOC' + String(STAFF_ACCOUNTS.filter(s => s.role.toLowerCase().includes('doctor')).length + 5).padStart(3, '0');
  } else {
    newId = 'STF' + String(STAFF_ACCOUNTS.filter(s => !s.role.toLowerCase().includes('doctor')).length + 8).padStart(3, '0');
  }
  const defaultPass = 'Pass123';
  
  showToast("Creating user authentication account...", "info");
  
  try {
    // 1. Create auth user credentials in Firebase Auth (gracefully catch if email is already in use)
    try {
      await registerUserWithFirebase(email, defaultPass);
    } catch (authError) {
      if (authError.code === 'auth/email-already-in-use') {
        console.warn("Auth user already exists, creating profile document anyway:", email);
      } else {
        throw authError;
      }
    }
    
    // 2. Save staff profile document to Firestore
    const newStaff = {
      id: newId,
      name: name,
      role: role,
      dept: dept,
      license: license,
      email: email,
      status: 'Active',
      shift: "Morning",
      workDays: "Mon,Tue,Wed,Thu,Fri",
      qualification: role.includes("Dr") ? "MD" : "Diploma",
      specialization: dept,
      phone: "9876543210",
      leaveBalance: 15,
      joiningDate: new Date().toISOString().split('T')[0]
    };
    
    await setDoc(doc(db, "staffAccounts", newId), newStaff);
    
    logAudit('Create', newId, `New staff account created: ${name} (${role}, ${dept}, email: ${email})`);
    showToast(`Staff account created for ${name}! Default password is: ${defaultPass}`, "success");
    
    // Clear form
    document.getElementById('new-staff-name').value = '';
    document.getElementById('new-staff-license').value = '';
    document.getElementById('new-staff-email').value = '';
    document.getElementById('admin-staff-create-form').style.display = 'none';
    
    renderAdminStaff();
  } catch (err) {
    console.error(err);
    showToast("Error creating staff account: " + err.message, "error");
  }
});

// Stat card click handler
window.showStatDetail = function(type) {
  const panel = document.getElementById('admin-stat-detail-panel');
  const titleEl = document.getElementById('stat-detail-title');
  const content = document.getElementById('stat-detail-content');
  
  if (type === 'patients') {
    titleEl.textContent = 'Registered Patients';
    if (STATE.patients.length === 0) {
      content.innerHTML = '<p style="color:var(--text-2); padding:12px 0;">No patients registered yet. Use the Reception desk to register patients.</p>';
    } else {
      let html = '<div class="table-wrapper"><table class="ehr-table"><thead><tr><th>Patient ID</th><th>Name</th><th>Mobile</th><th>Blood Group</th><th>ABHA</th></tr></thead><tbody>';
      STATE.patients.forEach(p => {
        html += `<tr><td><code>${p.id}</code></td><td class="text-bold">${p.name}</td><td>${p.mobile}</td><td>${p.bloodGroup || '-'}</td><td>${p.abhaId ? '<span class="status-indicator status-done">Linked</span>' : '<span class="status-indicator status-canceled">No</span>'}</td></tr>`;
      });
      html += '</tbody></table></div>';
      content.innerHTML = html;
    }
  } else if (type === 'staff') {
    titleEl.textContent = 'Staff Accounts Overview';
    const deptCounts = {};
    STAFF_ACCOUNTS.forEach(s => { deptCounts[s.dept] = (deptCounts[s.dept] || 0) + 1; });
    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">';
    Object.entries(deptCounts).forEach(([dept, count]) => {
      html += `<div class="glass-card" style="padding:14px; text-align:center;"><div style="font-size:1.5rem; font-weight:800; color:var(--primary); font-family:Space Grotesk,sans-serif;">${count}</div><div style="font-size:0.78rem; color:var(--text-2); margin-top:2px;">${dept}</div></div>`;
    });
    html += '</div>';
    content.innerHTML = html;
  } else if (type === 'abha') {
    titleEl.textContent = 'ABHA Linking Details';
    const linked = STATE.patients.filter(p => p.abhaId).length;
    const total = STATE.patients.length;
    content.innerHTML = `
      <div style="display:flex; gap:24px; align-items:center; padding:12px 0;">
        <div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--success); font-family:Space Grotesk,sans-serif;">${linked}</div><div style="font-size:0.78rem; color:var(--text-2);">ABHA Linked</div></div>
        <div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--danger); font-family:Space Grotesk,sans-serif;">${total - linked}</div><div style="font-size:0.78rem; color:var(--text-2);">Not Linked</div></div>
        <div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--primary); font-family:Space Grotesk,sans-serif;">${total ? Math.round(linked/total*100) : 0}%</div><div style="font-size:0.78rem; color:var(--text-2);">Linking Rate</div></div>
      </div>
      <p style="font-size:0.82rem; color:var(--text-2); margin-top:8px;">ABDM Target: ≥80% ABHA linking rate for DPDP compliance.</p>
    `;
  } else if (type === 'consent') {
    titleEl.textContent = 'Research Consent Overview';
    const academic = STATE.patients.filter(p => p.consentAcademic).length;
    const commercial = STATE.patients.filter(p => p.consentCommercial).length;
    const total = STATE.patients.length;
    content.innerHTML = `
      <div style="display:flex; gap:24px; align-items:center; padding:12px 0;">
        <div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--primary); font-family:Space Grotesk,sans-serif;">${total}</div><div style="font-size:0.78rem; color:var(--text-2);">Total Patients</div></div>
        <div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--success); font-family:Space Grotesk,sans-serif;">${academic}</div><div style="font-size:0.78rem; color:var(--text-2);">Academic Consent</div></div>
        <div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--accent); font-family:Space Grotesk,sans-serif;">${commercial}</div><div style="font-size:0.78rem; color:var(--text-2);">Commercial AI Consent</div></div>
      </div>
      <p style="font-size:0.82rem; color:var(--text-2); margin-top:8px;">All consent agreements are DPDP Act 2023 compliant and revocable by patient.</p>
    `;
  }
  
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// Clear simulation logs
document.getElementById('btn-clear-audit-logs').addEventListener('click', () => {
  STATE.auditLogs = [
    { id: 'LOG-INIT', timestamp: new Date().toISOString(), userRole: 'Super Admin', userId: 'STF001', userName: 'Dr. Vikram Aditya', actionType: 'Create', recordId: 'SYS', description: 'Audits flushed by Super Admin', device: 'Chrome/Win10' }
  ];
  saveToLocalStorage();
  renderAuditLogs();
  showToast("Audit logs cleared successfully.");
});

// Filter audits
document.getElementById('audit-filter-action').addEventListener('change', renderAuditLogs);

// Policy changes & module toggles listeners
document.getElementById('policy-retention').addEventListener('change', (e) => {
  logAudit('Edit', 'POLICY', `Updated clinical data retention policy to: ${e.target.value} Years`);
  showToast(`Data retention policy updated to ${e.target.value} Years.`, "info");
});

document.getElementById('policy-2fa').addEventListener('change', (e) => {
  logAudit('Edit', 'POLICY', `Updated staff security policy: Enforce 2FA = ${e.target.value.toUpperCase()}`);
  showToast(`Staff 2FA policy is now: ${e.target.value.toUpperCase()}.`, "info");
});

['module-pharmacy', 'module-radiology', 'module-lab'].forEach(id => {
  document.getElementById(id).addEventListener('change', (e) => {
    const modName = id.replace('module-', '').toUpperCase();
    logAudit('Edit', 'POLICY', `Toggled system module ${modName}: Active = ${e.target.checked}`);
    showToast(`${modName} module set to ${e.target.checked ? 'ACTIVE' : 'INACTIVE'}.`, "info");
  });
});

// ==========================================
// 7. MODULE: RECEPTION WORKFLOWS
// ==========================================

function populateDoctorsSelect() {
  const select = document.getElementById('appointment-doctor');
  select.innerHTML = '<option value="">-- Choose Consultant / Dept --</option>';
  
  DOCTORS.forEach(doc => {
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = `${doc.name} (${doc.dept}) - [${doc.schedule}]`;
    select.appendChild(opt);
  });
}

// Register patient form submit
document.getElementById('btn-submit-registration').addEventListener('click', () => {
  const name = document.getElementById('reg-name').value;
  const dob = document.getElementById('reg-dob').value;
  const gender = document.getElementById('reg-gender').value;
  const mobile = document.getElementById('reg-mobile').value;
  const bloodGroup = document.getElementById('reg-blood').value;
  const emergency = document.getElementById('reg-emergency').value;
  const insurance = document.getElementById('reg-insurance').value;
  const academic = document.getElementById('reg-consent-academic').checked;
  const commercial = document.getElementById('reg-consent-commercial').checked;
  
  // ABDM field checking
  const abha = document.getElementById('reception-abha-status-badge').style.display !== 'none' 
               ? document.getElementById('reception-abha-display-id').textContent 
               : '';
  
  if (!name || !dob || !gender || !mobile || !emergency) {
    showToast("Please fill all mandatory (*) patient details.", "error");
    return;
  }
  
  const newPatientId = `AURA-2026-${String(STATE.patients.length + 1).padStart(4, '0')}`;
  
  const newPatient = {
    id: newPatientId,
    name, dob, gender, mobile, bloodGroup, emergency,
    insurance: insurance || 'N/A',
    abhaId: abha,
    consentAcademic: academic,
    consentCommercial: commercial,
    consentFuture: true,
    regDate: new Date().toISOString(),
    status: 'Booked'
  };
  
  mutatePatient(newPatient)
    .then(() => {
      logAudit('Create', newPatientId, `Registered new patient profile: ${newPatientId} (ABHA: ${abha ? 'Linked' : 'Not Linked'})`);
      showToast(`Registered Patient ID: ${newPatientId}`);
    })
    .catch(err => {
      console.error(err);
      showToast("Error registering patient: " + err.message, "error");
    });
  
  // Auto-set the active billing or appointment patient
  document.getElementById('appointment-patient-id').value = newPatientId;
  
  // Clear form
  document.getElementById('reception-registration-form').reset();
  document.getElementById('reception-abha-status-badge').style.display = 'none';
  document.getElementById('reg-abha-input').value = '';
  document.getElementById('reg-abha-input').disabled = false;
  document.getElementById('btn-reception-abha-verify').disabled = false;
  document.getElementById('btn-reception-abha-verify').textContent = 'Get OTP';
  
  renderReceptionQueue();
});

// ABHA ID Verification trigger
document.getElementById('btn-reception-abha-verify').addEventListener('click', () => {
  const inputVal = document.getElementById('reg-abha-input').value;
  if (!inputVal) {
    showToast("Please enter an Aadhaar/Mobile number or pre-existing ABHA ID first.", "error");
    return;
  }
  
  // Open OTP verification modal
  const otpModal = document.getElementById('modal-abha-otp');
  otpModal.classList.add('open');
  document.getElementById('abha-otp-input').focus();
});

// Submit OTP
document.getElementById('btn-submit-abha-otp').addEventListener('click', () => {
  const otpVal = document.getElementById('abha-otp-input').value;
  if (otpVal !== '123456') {
    showToast("Invalid verification OTP. Please try code 123456.", "error");
    return;
  }
  
  // Mock generating ABHA address
  const userMobile = document.getElementById('reg-abha-input').value || '9876543210';
  let abhaAddress = userMobile;
  if (!abhaAddress.includes('@')) {
    abhaAddress = abhaAddress.slice(-4) + Math.floor(1000 + Math.random() * 9000) + '@abdm';
  }
  
  // Update badge UI in front desk
  document.getElementById('reception-abha-display-id').textContent = abhaAddress;
  document.getElementById('reception-abha-status-badge').style.display = 'inline-flex';
  
  // Lock fields
  document.getElementById('reg-abha-input').disabled = true;
  document.getElementById('btn-reception-abha-verify').disabled = true;
  document.getElementById('btn-reception-abha-verify').textContent = 'Linked';
  
  // Close modal
  document.getElementById('modal-abha-otp').classList.remove('open');
  showToast("ABDM Credentials verified and ABHA profile linked successfully!");
});

// Book Appointment button
document.getElementById('btn-schedule-appointment').addEventListener('click', () => {
  const pId = document.getElementById('appointment-patient-id').value;
  const docId = document.getElementById('appointment-doctor').value;
  const appType = document.getElementById('appointment-type').value;
  
  if (!pId) {
    showToast("Please select a patient from the database to schedule.", "error");
    return;
  }
  if (!docId) {
    showToast("Please select a consultant physician.", "error");
    return;
  }
  
  const patientObj = STATE.patients.find(p => p.id === pId);
  const docObj = DOCTORS.find(d => d.id === docId);
  
  if (!patientObj || !docObj) {
    showToast("Data integrity violation. Patient/Doctor record missing.", "error");
    return;
  }
  
  const aptId = `APT-${Date.now().toString().slice(-4)}`;
  const tokenNum = STATE.appointments.filter(a => a.doctorId === docId).length + 101;
  
  // Derive department from doctor
  const deptName = docObj ? docObj.dept : 'General Medicine';
  
  const newApt = {
    id: aptId,
    patientId: pId,
    doctorId: docId,
    department: deptName,
    type: appType,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString().slice(0, 5),
    status: 'Booked',
    token: tokenNum
  };
  
  patientObj.status = 'OPD Queue';
  
  Promise.all([
    mutatePatient(patientObj),
    convex.mutation(api.db.upsertAppointment, newApt)
  ]).then(() => {
    logAudit('Create', aptId, `Scheduled appointment for patient ID: ${pId} with ${docObj.name} (Token: #${tokenNum})`);
    showToast(`OPD Slot Scheduled: Token #${tokenNum}`);
  }).catch(err => {
    console.error(err);
    showToast("Scheduling failed: " + err.message, "error");
  });
  
  // Reset selector
  document.getElementById('appointment-patient-id').value = '';
  renderReceptionQueue();
});

// Render Reception Queue dashboard
function renderReceptionQueue() {
  const tbody = document.getElementById('reception-queue-table-body');
  tbody.innerHTML = '';
  
  if (STATE.appointments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-2);">No active walk-in or booked queue instances.</td></tr>`;
    return;
  }

  // Render appointments chronologically
  STATE.appointments.forEach(apt => {
    const patientObj = STATE.patients.find(p => p.id === apt.patientId);
    if (!patientObj) return;
    
    const docObj = DOCTORS.find(d => d.id === apt.doctorId);
    const docName = docObj ? docObj.name : 'Unknown Doctor';
    const deptName = apt.department || (docObj ? docObj.dept : '-');
    
    const tr = document.createElement('tr');
    
    let statusClass = 'status-booked';
    if (apt.status === 'Checked In') statusClass = 'status-arrived';
    if (apt.status === 'In Consultation') statusClass = 'status-active';
    if (apt.status === 'Sent for Tests') statusClass = 'status-pending';
    if (apt.status === 'Results Ready') statusClass = 'status-results-ready';
    if (apt.status === 'Done') statusClass = 'status-done';
    
    tr.innerHTML = `
      <td><span class="badge-round" style="background:var(--primary);">${apt.token}</span></td>
      <td><code>${apt.patientId}</code></td>
      <td><span class="text-bold">${patientObj.name}</span><br><small class="text-muted">${patientObj.mobile}</small></td>
      <td>${deptName}<br><small class="text-muted">${docName}</small></td>
      <td><span class="status-indicator ${statusClass}">${apt.status}</span></td>
      <td>
        ${apt.status === 'Booked' ? `<button class="glass-btn glass-btn-success" style="padding:4px 8px; font-size:0.75rem;" onclick="checkInPatient('${apt.id}')">Check In</button>` : ''}
        ${apt.status === 'Checked In' ? `<span class="text-muted" style="font-size:0.8rem;">Waiting Vitals</span>` : ''}
        ${apt.status === 'In Consultation' ? `<span class="text-muted" style="font-size:0.8rem;">Consulting</span>` : ''}
        ${apt.status === 'Sent for Tests' ? `<span style="font-size:0.8rem;color:var(--info);font-weight:600;">⏳ Awaiting Results</span>` : ''}
        ${apt.status === 'Results Ready' ? `<span style="font-size:0.8rem;color:var(--primary);font-weight:700;">📋 Results Ready</span>` : ''}
        ${apt.status === 'Done' ? `<span class="text-success" style="font-size:0.8rem; font-weight:700;">Completed</span>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function checkInPatient(aptId) {
  const apt = STATE.appointments.find(a => a.id === aptId);
  if (!apt) return;
  
  apt.status = 'Checked In';
  const patientObj = STATE.patients.find(p => p.id === apt.patientId);
  if (patientObj) {
    patientObj.status = 'OPD Queue';
  }
  
  Promise.all([
    convex.mutation(api.db.upsertAppointment, apt),
    patientObj ? mutatePatient(patientObj) : Promise.resolve()
  ]).then(() => {
    logAudit('Edit', aptId, `Checked in patient ID: ${apt.patientId} at Front Desk`);
    showToast("Patient checked-in. Routed to nursing vitals station.");
  }).catch(err => {
    console.error(err);
    showToast("Check-in failed: " + err.message, "error");
  });
}

// ==========================================
// 8. MODULE: NURSING WORKFLOWS
// ==========================================

function renderNursingQueue() {
  const list = document.getElementById('nursing-patient-list');
  list.innerHTML = '';
  
  let waitingApts = STATE.appointments.filter(a => a.status === 'Checked In' || a.status === 'Results Ready');
  
  // Department-level filtering for nurses
  if (STATE.currentUserProfile && STATE.currentUserProfile.role.toLowerCase().includes("nurs") && STATE.currentUserProfile.dept) {
    const nurseDept = STATE.currentUserProfile.dept.toLowerCase();
    if (nurseDept !== "nursing care" && nurseDept !== "general" && nurseDept !== "management") {
      waitingApts = waitingApts.filter(a => a.department && a.department.toLowerCase().includes(nurseDept));
    }
  }
  
  if (waitingApts.length === 0) {
    list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No patients currently waiting at vitals station.</p>`;
    return;
  }
  
  waitingApts.forEach(apt => {
    const p = STATE.patients.find(pt => pt.id === apt.patientId);
    if (!p) return;
    
    const isReturning = apt.status === 'Results Ready';
    const card = document.createElement('div');
    card.className = `record-item-card ${isReturning ? 'results-ready' : ''} ${STATE.selectedPatientId === p.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="record-item-title">${p.name}</div>
      <div class="record-item-subtitle">
        <span>Token #${apt.token}</span>
        <span>ID: ${p.id}</span>
      </div>
      ${isReturning ? '<div style="font-size:.68rem;color:var(--primary);font-weight:700;margin-top:3px">📋 Investigation Results Available</div>' : '<div style="font-size:.68rem;color:var(--text-3);margin-top:3px">Waiting for vitals</div>'}
    `;
    
    card.addEventListener('click', () => {
      document.querySelectorAll('#nursing-patient-list .record-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (isReturning) {
        sendResultsPatientToDoctor(apt.id, p.id);
      } else {
        selectPatientForVitals(p.id);
      }
    });
    
    list.appendChild(card);
  });
}

function selectPatientForVitals(pId) {
  STATE.selectedPatientId = pId;
  const p = STATE.patients.find(pt => pt.id === pId);
  if (!p) return;
  
  // Set UI views
  document.getElementById('nursing-details-workspace').style.display = 'block';
  document.getElementById('nursing-empty-state').style.display = 'none';
  
  document.getElementById('nursing-active-patient-name').textContent = p.name;
  
  const vitals = STATE.vitals.find(vt => vt.patientId === pId);
  // Render past vitals if any
  if (vitals) {
    document.getElementById('disp-vital-bp').textContent = vitals.bp || '-';
    document.getElementById('disp-vital-temp').textContent = vitals.temp ? `${vitals.temp}` : '-';
    document.getElementById('disp-vital-spo2').textContent = vitals.spo2 ? `${vitals.spo2}` : '-';
    document.getElementById('disp-vital-pulse').textContent = vitals.pulse ? `${vitals.pulse}` : '-';
    document.getElementById('disp-vital-sugar').textContent = vitals.sugar ? `${vitals.sugar}` : '-';
    
    // Highlight abnormalities
    evaluateVitalsAlerts(vitals);
  } else {
    // Reset
    document.querySelectorAll('.vital-box').forEach(box => box.classList.remove('abnormal'));
    document.getElementById('disp-vital-bp').textContent = '-';
    document.getElementById('disp-vital-temp').textContent = '-';
    document.getElementById('disp-vital-spo2').textContent = '-';
    document.getElementById('disp-vital-pulse').textContent = '-';
    document.getElementById('disp-vital-sugar').textContent = '-';
  }
}

function evaluateVitalsAlerts(v) {
  // Reset
  document.querySelectorAll('.vital-box').forEach(box => box.classList.remove('abnormal'));
  
  // Temp threshold > 99.5F
  if (v.temp && parseFloat(v.temp) > 99.5) {
    document.getElementById('vital-box-temp').classList.add('abnormal');
  }
  // SpO2 < 95%
  if (v.spo2 && parseInt(v.spo2) < 95) {
    document.getElementById('vital-box-spo2').classList.add('abnormal');
  }
  // Blood sugar random > 140 mg/dL or fasting > 100 mg/dL
  if (v.sugar && parseInt(v.sugar) > 140) {
    document.getElementById('vital-box-sugar').classList.add('abnormal');
  }
  
  // BP Systolic > 140 or Diastolic > 90
  if (v.bp) {
    const parts = v.bp.split('/');
    if (parts.length === 2) {
      const sys = parseInt(parts[0]);
      const dia = parseInt(parts[1]);
      if (sys > 140 || dia > 90) {
        document.getElementById('vital-box-bp').classList.add('abnormal');
      }
    }
  }
}

// Save vitals
document.getElementById('btn-save-vitals').addEventListener('click', () => {
  if (!STATE.selectedPatientId) return;
  
  const bp = document.getElementById('vital-in-bp').value;
  const temp = document.getElementById('vital-in-temp').value;
  const spo2 = document.getElementById('vital-in-spo2').value;
  const pulse = document.getElementById('vital-in-pulse').value;
  const sugar = document.getElementById('vital-in-sugar').value;
  const notes = document.getElementById('vital-in-notes').value;
  
  if (!bp && !temp && !spo2 && !pulse && !sugar) {
    showToast("Please input at least one vital parameter.", "error");
    return;
  }
  
  const patient = STATE.patients.find(p => p.id === STATE.selectedPatientId);
  if (!patient) return;
  
  const vitalsObj = {
    bp: bp || null,
    temp: temp ? parseFloat(temp) : null,
    spo2: spo2 ? parseInt(spo2) : null,
    pulse: pulse ? parseInt(pulse) : null,
    sugar: sugar ? parseInt(sugar) : null,
    notes: notes || 'No complaints logged'
  };
  
  const vitalsId = `VIT-${Date.now().toString().slice(-4)}`;
  const newVitalsObj = {
    id: vitalsId,
    patientId: patient.id,
    bp: bp || "",
    temp: temp ? parseFloat(temp) : 0,
    spo2: spo2 ? parseInt(spo2) : 0,
    pulse: pulse ? parseInt(pulse) : 0,
    sugar: sugar ? parseInt(sugar) : 0,
    notes: notes || 'No complaints logged',
    timestamp: new Date().toISOString()
  };
  
  // Find associated appointment and dispatch to doctor
  const apt = STATE.appointments.find(a => a.patientId === patient.id && a.status === 'Checked In');
  if (apt) {
    apt.status = 'In Consultation';
  }
  
  Promise.all([
    convex.mutation(api.db.upsertVitals, newVitalsObj),
    apt ? convex.mutation(api.db.upsertAppointment, apt) : Promise.resolve()
  ]).then(() => {
    logAudit('Create', patient.id, `Recorded patient vital signs: BP ${bp || 'N/A'}, SpO2 ${spo2 || 'N/A'}%`);
    showToast("Vitals saved and patient dispatched to Clinical Consultation room.");
  }).catch(err => {
    console.error(err);
    showToast("Vitals save failed: " + err.message, "error");
  });
  
  // Clear workspace
  document.getElementById('nursing-details-workspace').style.display = 'none';
  document.getElementById('nursing-empty-state').style.display = 'flex';
  document.getElementById('nursing-vitals-form').reset();
  STATE.selectedPatientId = null;
  
  renderNursingQueue();
});

// ==========================================
// 9. MODULE: TREATING DOCTOR WORKFLOWS
// ==========================================

function renderDoctorQueue() {
  const list = document.getElementById('doctor-patient-list');
  list.innerHTML = '';
  
  let activeApts = STATE.appointments.filter(a => a.status === 'In Consultation');
  
  // Doctor filtering: only show patients assigned to this doctor
  if (STATE.currentUserProfile && STATE.currentUserProfile.role.toLowerCase().includes("doctor")) {
    activeApts = activeApts.filter(a => a.doctorId === STATE.currentUserProfile.id);
  }
  
  if (activeApts.length === 0) {
    list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No patients waiting in consult room queue.</p>`;
    return;
  }
  
  activeApts.forEach(apt => {
    const p = STATE.patients.find(pt => pt.id === apt.patientId);
    if (!p) return;
    
    const card = document.createElement('div');
    card.className = `record-item-card ${STATE.selectedPatientId === p.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="record-item-title">${p.name}</div>
      <div class="record-item-subtitle">
        <span>Token #${apt.token}</span>
        <span class="text-bold" style="color:var(--primary);">${p.id}</span>
      </div>
    `;
    
    card.addEventListener('click', () => {
      document.querySelectorAll('#doctor-patient-list .record-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectPatientForDoctor(p.id);
    });
    
    list.appendChild(card);
  });
}

function selectPatientForDoctor(pId) {
  STATE.selectedPatientId = pId;
  const p = STATE.patients.find(pt => pt.id === pId);
  if (!p) return;
  
  document.getElementById('doctor-details-workspace').style.display = 'block';
  document.getElementById('doctor-empty-state').style.display = 'none';
  
  // Setup header
  document.getElementById('doctor-active-patient-name').textContent = p.name;
  document.getElementById('doctor-active-patient-id').textContent = p.id;
  document.getElementById('doctor-active-patient-insurance').textContent = `Ins: ${p.insurance}`;
  
  const abhaBadge = document.getElementById('doctor-active-patient-abha-badge');
  if (p.abhaId) {
    abhaBadge.style.display = 'inline-flex';
    abhaBadge.innerHTML = `<span class="abha-logo-mini">A</span> ABHA Linked: ${p.abhaId}`;
  } else {
    abhaBadge.style.display = 'none';
  }
  
  // Vitals
  const vitals = STATE.vitals.find(vt => vt.patientId === pId);
  if (vitals) {
    document.getElementById('doctor-vitals-preview').textContent = 
      `BP: ${vitals.bp || 'N/A'} | Temp: ${vitals.temp || 'N/A'}°F | SpO2: ${vitals.spo2 || 'N/A'}% | Sugar: ${vitals.sugar || 'N/A'} mg/dL`;
  } else {
    document.getElementById('doctor-vitals-preview').textContent = "Vitals not recorded in visit checklist.";
  }
  
  // Reset doctor states
  STATE.doctorConsult.soapA_Tags = [];
  STATE.doctorConsult.prescriptionMedicines = [];
  renderDoctorSoapTags();
  renderDoctorPrescriptionTable();
  
  // Clean inputs
  if (document.getElementById('soap-s')) document.getElementById('soap-s').value = '';
  if (document.getElementById('soap-o')) document.getElementById('soap-o').value = '';
  if (document.getElementById('soap-p')) document.getElementById('soap-p').value = '';
  if (document.getElementById('soap-a-search')) document.getElementById('soap-a-search').value = '';
  
  const labOrderEl = document.getElementById('doc-order-lab');
  if (labOrderEl) labOrderEl.value = '';
  const radioOrderEl = document.getElementById('doc-order-radio');
  if (radioOrderEl) radioOrderEl.value = '';
  
  const researchFlagEl = document.getElementById('doc-research-flag');
  if (researchFlagEl) researchFlagEl.checked = false;
  
  // Clear any selected investigation chips
  document.querySelectorAll('.investigation-chip.selected').forEach(chip => {
    chip.classList.remove('selected');
  });
  
  // Load patient file repository
  renderDoctorRecordsTab(p.id);
  
  // Check if this is a returning patient with results
  const apt = STATE.appointments.find(a => a.patientId === pId && a.status === 'In Consultation');
  const isReturning = apt && apt.investigationStatus === 'Results Ready';
  const returningBadge = document.getElementById('doctor-returning-badge');
  if (returningBadge) {
    returningBadge.style.display = isReturning ? 'block' : 'none';
  }
  
  // Toggle first tab active
  toggleDoctorTabs(isReturning ? 'history' : 'clinical');
  
  logAudit('View', p.id, `Opened medical files repository for consultation`);
}

// Doctor tab selector
function toggleDoctorTabs(tab) {
  const btnClinical = document.getElementById('tab-doc-clinical');
  const btnHistory = document.getElementById('tab-doc-history');
  const divClinical = document.getElementById('doctor-tab-soap-content');
  const divHistory = document.getElementById('doctor-tab-history-content');
  
  if (tab === 'clinical') {
    btnClinical.classList.add('active');
    btnHistory.classList.remove('active');
    divClinical.style.display = 'block';
    divHistory.style.display = 'none';
  } else {
    btnClinical.classList.remove('active');
    btnHistory.classList.add('active');
    divClinical.style.display = 'none';
    divHistory.style.display = 'block';
  }
}

document.getElementById('tab-doc-clinical').addEventListener('click', () => toggleDoctorTabs('clinical'));
document.getElementById('tab-doc-history').addEventListener('click', () => toggleDoctorTabs('history'));

// Autocomplete Diagnosis ICD10
function initDoctorICD10Autocomplete() {
  const input = document.getElementById('soap-a-search');
  const dropdown = document.getElementById('soap-a-dropdown');
  
  input.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    dropdown.innerHTML = '';
    
    if (!val) {
      dropdown.style.display = 'none';
      return;
    }
    
    const matches = ICD10_CODES.filter(item => 
      item.code.toLowerCase().includes(val) || 
      item.term.toLowerCase().includes(val)
    );
    
    if (matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    matches.slice(0, 5).forEach(match => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.innerHTML = `<strong>${match.code}</strong> — ${match.term}`;
      div.addEventListener('click', () => {
        addDiagnosisTag(match.code, match.term);
        input.value = '';
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(div);
    });
    
    dropdown.style.display = 'block';
  });
  
  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== dropdown) {
      dropdown.style.display = 'none';
    }
  });
}

function addDiagnosisTag(code, term) {
  const fullTag = `${code} - ${term}`;
  if (!STATE.doctorConsult.soapA_Tags.includes(fullTag)) {
    STATE.doctorConsult.soapA_Tags.push(fullTag);
    renderDoctorSoapTags();
  }
}

function renderDoctorSoapTags() {
  const container = document.getElementById('soap-a-tags');
  container.innerHTML = '';
  
  STATE.doctorConsult.soapA_Tags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.innerHTML = `
      <span>${tag}</span>
      <span class="tag-remove">&times;</span>
    `;
    badge.querySelector('.tag-remove').addEventListener('click', () => {
      STATE.doctorConsult.soapA_Tags = STATE.doctorConsult.soapA_Tags.filter(t => t !== tag);
      renderDoctorSoapTags();
    });
    container.appendChild(badge);
  });
}

// Medicine prescript list
document.getElementById('btn-doc-add-med').addEventListener('click', () => {
  // Add a blank template
  STATE.doctorConsult.prescriptionMedicines.push({
    name: 'Medication - Paracetamol 650mg',
    dose: '1-0-1',
    freq: 'After meals',
    duration: '5 Days'
  });
  renderDoctorPrescriptionTable();
});

function renderDoctorPrescriptionTable() {
  const tbody = document.getElementById('prescription-builder-body');
  tbody.innerHTML = '';
  
  STATE.doctorConsult.prescriptionMedicines.forEach((med, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select class="role-select" style="padding:4px 28px 4px 6px;" onchange="updatePrescriptionItem(${idx}, 'name', this.value)">
          <option value="Medication - Paracetamol 650mg" ${med.name.includes('Paracetamol')?'selected':''}>Paracetamol 650mg</option>
          <option value="Medication - Metformin 500mg" ${med.name.includes('Metformin')?'selected':''}>Metformin 500mg</option>
          <option value="Medication - Amlodipine 5mg" ${med.name.includes('Amlodipine')?'selected':''}>Amlodipine 5mg</option>
          <option value="Medication - Amoxicillin 500mg" ${med.name.includes('Amoxicillin')?'selected':''}>Amoxicillin 500mg</option>
        </select>
      </td>
      <td><input type="text" value="${med.dose}" style="padding:4px 6px; font-size:0.85rem;" onchange="updatePrescriptionItem(${idx}, 'dose', this.value)"></td>
      <td><input type="text" value="${med.freq}" style="padding:4px 6px; font-size:0.85rem;" onchange="updatePrescriptionItem(${idx}, 'freq', this.value)"></td>
      <td><input type="text" value="${med.duration}" style="padding:4px 6px; font-size:0.85rem;" onchange="updatePrescriptionItem(${idx}, 'duration', this.value)"></td>
      <td><button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="removePrescriptionItem(${idx})">&times;</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.updatePrescriptionItem = function(idx, field, val) {
  STATE.doctorConsult.prescriptionMedicines[idx][field] = val;
};

window.removePrescriptionItem = function(idx) {
  STATE.doctorConsult.prescriptionMedicines.splice(idx, 1);
  renderDoctorPrescriptionTable();
};

// External Document upload simulation
document.getElementById('btn-doc-upload-file').addEventListener('click', () => {
  const docType = prompt("Select Document Type:\n(Lab Report, Radiology Report, Discharge Summary, Referral Letter)", "Referral Letter");
  if (!docType) return;
  
  const docName = prompt("Enter File Name:", "Referral_Note_GlobalLabs.pdf");
  if (!docName) return;

  const fileId = `DOC-${Date.now().toString().slice(-4)}`;
  const patient = STATE.patients.find(p => p.id === STATE.selectedPatientId);
  
  const newInv = {
    id: fileId,
    patientId: STATE.selectedPatientId,
    doctorId: 'DOC002',
    doctorName: 'Dr. Vikram Aditya',
    type: docType,
    testName: docName,
    status: 'Final',
    date: new Date().toISOString(),
    comments: 'Uploaded external diagnostic files repository.'
  };

  convex.mutation(api.db.upsertInvestigation, newInv)
    .then(() => {
      logAudit('Create', fileId, `Uploaded external medical document: ${docName} for patient ID: ${STATE.selectedPatientId}`);
      showToast("Document uploaded and linked to EHR profile.");
      renderDoctorRecordsTab(STATE.selectedPatientId);
    })
    .catch(err => {
      console.error(err);
      showToast("Upload failed: " + err.message, "error");
    });
});

// Render Patient records tab in Doctor view
function renderDoctorRecordsTab(pId) {
  const container = document.getElementById('doctor-historical-docs-list');
  container.innerHTML = '';
  
  // Find clinical summaries and lab reports
  const clinicals = STATE.clinicalRecords.filter(c => c.patientId === pId);
  const investigations = STATE.investigations.filter(i => i.patientId === pId && i.status === 'Final');
  
  if (clinicals.length === 0 && investigations.length === 0) {
    container.innerHTML = `<p style="padding:16px; text-align:center; color:var(--text-2);">No medical history logs or finalized reports found.</p>`;
    return;
  }
  
  // Render SOAP summaries
  clinicals.forEach(c => {
    const div = document.createElement('div');
    div.className = 'record-item-card';
    div.innerHTML = `
      <div class="flex-between">
        <span class="status-indicator status-done">Clinical Summary (SOAP)</span>
        <small class="text-muted">${new Date(c.date).toLocaleDateString()}</small>
      </div>
      <div style="font-size:0.85rem; margin-top:8px;">
        <strong>Diagnosis:</strong> ${c.a.join(', ')}<br>
        <strong>Subjective:</strong> ${c.s.slice(0, 50)}...
      </div>
      <div class="flex-between" style="margin-top:10px;">
        <span style="font-size:0.75rem; font-style:italic;">Signee: ${c.signee}</span>
        <button class="glass-btn glass-btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="viewClinicalDocument('${c.id}')">View Details</button>
      </div>
    `;
    container.appendChild(div);
  });

  // Render investigations
  investigations.forEach(inv => {
    const div = document.createElement('div');
    div.className = 'record-item-card';
    div.innerHTML = `
      <div class="flex-between">
        <span class="status-indicator status-active">${inv.type} report</span>
        <small class="text-muted">${new Date(inv.date).toLocaleDateString()}</small>
      </div>
      <div style="font-size:0.85rem; margin-top:8px;">
        <strong>Study:</strong> ${inv.testName}<br>
        <strong>Findings:</strong> ${inv.comments ? inv.comments.slice(0, 50) + '...' : 'No notes'}
      </div>
      <button class="glass-btn glass-btn-secondary" style="padding:2px 8px; font-size:0.75rem; margin-top:10px;" onclick="viewInvestigationDocument('${inv.id}')">View Report</button>
    `;
    container.appendChild(div);
  });
}

// Doctor E-Sign process
document.getElementById('btn-doc-esign-finalize').addEventListener('click', () => {
  const s = document.getElementById('soap-s').value;
  const o = document.getElementById('soap-o').value;
  const tags = STATE.doctorConsult.soapA_Tags;
  
  if (!s || !tags.length) {
    showToast("Please provide Patient Complaints (Subjective) and Diagnosis tags.", "error");
    return;
  }
  
  // Open e-sign modal
  const modal = document.getElementById('modal-doctor-esign');
  modal.classList.add('open');
  
  const signPad = document.getElementById('esign-canvas-sim');
  signPad.classList.remove('signed');
  signPad.textContent = "Click here to record biometric signature";
});

// Click signature canvas simulator
document.getElementById('esign-canvas-sim').addEventListener('click', function() {
  this.classList.add('signed');
  this.textContent = "Dr. Vikram Aditya [MCI-224190]";
});

// Submit sign & close consult
document.getElementById('btn-submit-esign').addEventListener('click', () => {
  const pad = document.getElementById('esign-canvas-sim');
  if (!pad.classList.contains('signed')) {
    showToast("Please sign the biometric pad first.", "error");
    return;
  }
  
  const p = STATE.patients.find(pt => pt.id === STATE.selectedPatientId);
  const doc = STAFF_ACCOUNTS.find(s => s.role.toLowerCase().includes('admin')); // Vikram Aditya
  
  const docNotesId = `CLN-${Date.now().toString().slice(-4)}`;
  
  // Save Clinical Case record
  const newClinical = {
    id: docNotesId,
    patientId: STATE.selectedPatientId,
    doctorId: 'DOC002',
    doctorName: doc?.name || 'Dr. Vikram Aditya',
    date: new Date().toISOString(),
    s: document.getElementById('soap-s').value,
    o: document.getElementById('soap-o').value,
    a: [...STATE.doctorConsult.soapA_Tags],
    p: document.getElementById('soap-p').value,
    medicines: [...STATE.doctorConsult.prescriptionMedicines],
    signed: true,
    signee: doc?.name || 'Dr. Vikram Aditya',
    consentFlag: document.getElementById('doc-research-flag').checked
  };
  
  const selectedLab = document.getElementById('doc-order-lab');
  const selectedRadio = document.getElementById('doc-order-radio');
  
  // Collect selected investigation chips
  const selectedLabTests = document.querySelectorAll('#lab-test-chips .investigation-chip.selected');
  const selectedRadioTests = document.querySelectorAll('#radio-test-chips .investigation-chip.selected');
  const hasInvestigations = selectedLabTests.length > 0 || selectedRadioTests.length > 0 || (selectedLab && selectedLab.value) || (selectedRadio && selectedRadio.value);
  
  const promises = [];
  
  // 1. Clinical SOAP Mutation
  promises.push(convex.mutation(api.db.upsertClinicalRecord, newClinical));
  
  // Route Lab investigations from chips
  selectedLabTests.forEach(chip => {
    const testName = chip.dataset.test;
    const orderId = `L-${Date.now().toString().slice(-4)}-${Math.floor(Math.random()*100)}`;
    const newLab = {
      id: orderId,
      patientId: STATE.selectedPatientId,
      doctorId: 'DOC002',
      doctorName: doc?.name || 'Dr. Vikram Aditya',
      type: 'Lab',
      testName: testName,
      refRange: getRefRange(testName),
      status: 'Pending',
      date: new Date().toISOString()
    };
    promises.push(convex.mutation(api.db.upsertInvestigation, newLab));
    logAudit('Create', orderId, `Requested Lab: ${testName} for ${STATE.selectedPatientId}`);
  });
  
  // Route Radiology scans from chips
  selectedRadioTests.forEach(chip => {
    const testName = chip.dataset.test;
    const orderId = `R-${Date.now().toString().slice(-4)}-${Math.floor(Math.random()*100)}`;
    const newRadio = {
      id: orderId,
      patientId: STATE.selectedPatientId,
      doctorId: 'DOC002',
      doctorName: doc?.name || 'Dr. Vikram Aditya',
      type: 'Radiology',
      testName: testName,
      urgency: 'Routine',
      status: 'Pending',
      date: new Date().toISOString()
    };
    promises.push(convex.mutation(api.db.upsertInvestigation, newRadio));
    logAudit('Create', orderId, `Requested Radiology: ${testName} for ${STATE.selectedPatientId}`);
  });
  
  // Fallback: old dropdown selects (if still present)
  if (selectedLab && selectedLab.value) {
    const orderId = `L-${Date.now().toString().slice(-4)}`;
    const newLab = {
      id: orderId,
      patientId: STATE.selectedPatientId,
      doctorId: 'DOC002',
      doctorName: doc?.name || 'Dr. Vikram Aditya',
      type: 'Lab',
      testName: selectedLab.value,
      refRange: getRefRange(selectedLab.value),
      status: 'Pending',
      date: new Date().toISOString()
    };
    promises.push(convex.mutation(api.db.upsertInvestigation, newLab));
  }
  if (selectedRadio && selectedRadio.value) {
    const orderId = `R-${Date.now().toString().slice(-4)}`;
    const newRadio = {
      id: orderId,
      patientId: STATE.selectedPatientId,
      doctorId: 'DOC002',
      doctorName: doc?.name || 'Dr. Vikram Aditya',
      type: 'Radiology',
      testName: selectedRadio.value,
      urgency: 'Routine',
      status: 'Pending',
      date: new Date().toISOString()
    };
    promises.push(convex.mutation(api.db.upsertInvestigation, newRadio));
  }
  
  // Route Pharmacy prescription dispenser if medicines prescribed
  if (newClinical.medicines.length > 0) {
    const pharmId = `PHM-${Date.now().toString().slice(-4)}`;
    const newRx = {
      id: pharmId,
      patientId: STATE.selectedPatientId,
      doctorId: 'DOC002',
      doctorName: doc?.name || 'Dr. Vikram Aditya',
      type: 'Prescription',
      testName: 'Prescription Dispensing Request',
      status: 'Pending',
      date: new Date().toISOString(),
      medicines: newClinical.medicines
    };
    promises.push(convex.mutation(api.db.upsertInvestigation, newRx));
    logAudit('Create', pharmId, `Dispatched prescription registry code to Pharmacy`);
  }
  
  // Generate billing entry (Auto-bill consultant fee)
  const billId = `BIL-${Date.now().toString().slice(-4)}`;
  const services = [{ serviceName: 'OPD Consultation', qty: 1, rate: 500, amount: 500 }];
  
  // Append ordered items to invoice subtotal
  if (selectedLab) services.push({ serviceName: selectedLab, qty: 1, rate: SERVICE_PRICES[selectedLab] || 300, amount: SERVICE_PRICES[selectedLab] || 300 });
  if (selectedRadio) services.push({ serviceName: selectedRadio, qty: 1, rate: SERVICE_PRICES[selectedRadio] || 800, amount: SERVICE_PRICES[selectedRadio] || 800 });
  if (newClinical.medicines.length > 0) {
    newClinical.medicines.forEach(m => {
      const price = SERVICE_PRICES[m.name] || 100;
      services.push({ serviceName: m.name, qty: 1, rate: price, amount: price });
    });
  }
  
  const subtotal = services.reduce((sum, item) => sum + item.amount, 0);
  const gst = Math.round(subtotal * 0.05);
  
  const newBill = {
    id: billId,
    patientId: STATE.selectedPatientId,
    date: new Date().toISOString(),
    items: services,
    subtotal,
    gst,
    insuranceClaim: 0,
    tpaApproved: false,
    preAuthApproved: false,
    preAuthNum: '',
    paymentMode: '',
    total: subtotal + gst,
    status: 'Pending'
  };
  promises.push(convex.mutation(api.db.upsertBillingInvoice, newBill));
  
  // Mark appointment status based on whether investigations were ordered
  const apt = STATE.appointments.find(a => a.patientId === STATE.selectedPatientId && a.status === 'In Consultation');
  if (apt) {
    if (hasInvestigations) {
      apt.status = 'Sent for Tests';
      apt.investigationStatus = 'Sent for Tests';
    } else {
      apt.status = 'Done';
    }
    apt.department = apt.department || 'General Medicine';
    promises.push(convex.mutation(api.db.upsertAppointment, apt));
  }
  
  if (p) {
    p.status = hasInvestigations ? 'Under Investigation' : 'Discharged';
    promises.push(mutatePatient(p));
  }
  
  Promise.all(promises).then(() => {
    logAudit('Create', docNotesId, `Finalized clinical SOAP notes for patient ID: ${STATE.selectedPatientId}. ${hasInvestigations ? 'Referred for tests.' : 'Case closed.'}`);
    showToast(hasInvestigations ? "Case recorded. Patient referred for investigations." : "Case closed. Invoices dispatched.");
    
    // Close modals
    document.getElementById('modal-doctor-esign').classList.remove('open');
    
    // Clear doctor workspace
    document.getElementById('doctor-details-workspace').style.display = 'none';
    document.getElementById('doctor-empty-state').style.display = 'flex';
    STATE.selectedPatientId = null;
    
    renderDoctorQueue();
  }).catch(err => {
    console.error(err);
    showToast("Finalizing consult failed: " + err.message, "error");
  });
});

function getRefRange(test) {
  if (test.includes('Blood Sugar')) return '70 - 100 mg/dL';
  if (test.includes('HbA1c')) return '< 5.7%';
  if (test.includes('Count')) return '4.0 - 11.0 x10^3/uL';
  return 'N/A';
}

// Global modal document viewers
window.viewClinicalDocument = function(recordId) {
  const doc = STATE.clinicalRecords.find(c => c.id === recordId);
  if (!doc) return;
  
  const viewer = document.getElementById('modal-file-viewer');
  const patientName = getPatientName(doc.patientId);
  document.getElementById('file-viewer-title').textContent = `Clinical Summary: ${patientName}`;
  
  const medsRows = doc.medicines.map(m => `
    <tr>
      <td>${m.name.replace('Medication - ', '')}</td>
      <td>${m.dose}</td>
      <td>${m.freq}</td>
      <td>${m.duration}</td>
    </tr>
  `).join('');

  document.getElementById('file-viewer-body').innerHTML = `
    <div style="background:white; padding:20px; width:100%; border-radius:8px; line-height:1.6; font-size:0.85rem;">
      <div class="flex-between" style="border-bottom:1px solid #ddd; padding-bottom:8px; margin-bottom:10px;">
        <span><strong>Visit ID:</strong> ${doc.id}</span>
        <span><strong>Date:</strong> ${new Date(doc.date).toLocaleString()}</span>
      </div>
      <p><strong>Subjective:</strong> ${doc.s}</p>
      <p><strong>Objective:</strong> ${doc.o}</p>
      <p><strong>Diagnosis Tags:</strong> ${doc.a.join(', ')}</p>
      <p><strong>Care Plan:</strong> ${doc.p}</p>
      
      ${doc.medicines.length > 0 ? `
        <h4 style="margin-top:14px; margin-bottom:6px; color:var(--primary);">Prescribed Medicines</h4>
        <table style="width:100%; border-collapse:collapse;" class="ehr-table">
          <thead>
            <tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th></tr>
          </thead>
          <tbody>${medsRows}</tbody>
        </table>
      ` : ''}
      
      <div style="margin-top:20px; border-top:1px dashed #ddd; padding-top:10px; font-style:italic; color:var(--text-2);">
        Digitally signed by: ${doc.signee}
      </div>
    </div>
  `;
  
  viewer.classList.add('open');
  logAudit('View', recordId, `Viewed clinical SOAP file details`);
};

window.viewInvestigationDocument = function(invId) {
  const inv = STATE.investigations.find(i => i.id === invId);
  if (!inv) return;
  
  const viewer = document.getElementById('modal-file-viewer');
  document.getElementById('file-viewer-title').textContent = `${inv.type} Report: ${inv.testName}`;
  
  const patientName = getPatientName(inv.patientId);
  
  document.getElementById('file-viewer-body').innerHTML = `
    <div style="background:white; padding:20px; width:100%; border-radius:8px; line-height:1.6; font-size:0.85rem;">
      <div class="flex-between" style="border-bottom:1px solid #ddd; padding-bottom:8px; margin-bottom:10px;">
        <span><strong>Study ID:</strong> ${inv.id}</span>
        <span><strong>Date:</strong> ${new Date(inv.date).toLocaleString()}</span>
      </div>
      <p><strong>Patient Name:</strong> ${patientName} (${inv.patientId})</p>
      <p><strong>Requested By:</strong> ${inv.doctorName}</p>
      <hr style="margin:10px 0; border:none; border-top:1px solid #eee;">
      
      ${inv.type === 'Lab' ? `
        <div class="vital-box" style="margin-bottom:14px; display:inline-block; padding:10px 20px;">
          <div class="vital-box-title">Observed Parameter Value</div>
          <div class="vital-box-value">${inv.value}</div>
          <div class="vital-box-unit">Reference: ${inv.refRange}</div>
        </div>
      ` : ''}

      ${inv.type === 'Radiology' && inv.image ? `
        <div class="image-preview-sim" style="margin-bottom:14px;">
          <img src="${inv.image}" alt="Radiology Scan" style="max-height:180px;">
        </div>
      ` : ''}
      
      <p><strong>Clinician Findings & Remarks:</strong></p>
      <blockquote style="background:#f9f9f9; border-left:3px solid var(--primary); padding:10px; margin:8px 0; font-style:italic;">
        ${inv.comments}
      </blockquote>
      
      <span class="status-indicator status-done" style="margin-top:10px;">Status: Final Approved</span>
    </div>
  `;
  
  viewer.classList.add('open');
  logAudit('View', invId, `Viewed diagnostic ${inv.type} report files`);
};

// ==========================================
// 10. MODULE: LABORATORY WORKFLOWS
// ==========================================

function renderLabQueue() {
  const list = document.getElementById('lab-pending-list');
  list.innerHTML = '';
  
  const pendingLabs = STATE.investigations.filter(i => i.type === 'Lab' && i.status === 'Pending');
  
  if (pendingLabs.length === 0) {
    list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No pending laboratory tests.</p>`;
    return;
  }
  
  pendingLabs.forEach(lab => {
    const card = document.createElement('div');
    card.className = `record-item-card ${STATE.activeLabOrderId === lab.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="record-item-title">${lab.testName}</div>
      <div class="record-item-subtitle">
        <span>Patient: ${getPatientName(lab.patientId)}</span>
        <span>ID: ${lab.id}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('#lab-pending-list .record-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectLabOrder(lab.id);
    });
    list.appendChild(card);
  });
}

function selectLabOrder(orderId) {
  STATE.activeLabOrderId = orderId;
  const lab = STATE.investigations.find(i => i.id === orderId);
  if (!lab) return;
  
  document.getElementById('lab-workspace').style.display = 'block';
  document.getElementById('lab-empty-state').style.display = 'none';
  
  document.getElementById('lab-active-test-name').textContent = lab.testName;
  document.getElementById('lab-active-patient-details').value = `${getPatientName(lab.patientId)} (${lab.patientId})`;
  document.getElementById('lab-active-doctor-details').value = lab.doctorName;
  
  document.getElementById('lab-param-name').value = lab.testName;
  document.getElementById('lab-param-ref').value = lab.refRange || 'N/A';
  
  document.getElementById('lab-param-value').value = '';
  document.getElementById('lab-param-notes').value = '';
  document.getElementById('lab-file-pdf').value = '';
}

// Lab marking draft
document.getElementById('btn-lab-mark-pending').addEventListener('click', () => {
  showToast("Draft details saved to local cache.", "info");
});

// Finalize lab test
document.getElementById('btn-lab-submit-final').addEventListener('click', () => {
  const val = document.getElementById('lab-param-value').value;
  const notes = document.getElementById('lab-param-notes').value;
  
  if (!val) {
    showToast("Please record the observed test parameter value.", "error");
    return;
  }
  
  const lab = STATE.investigations.find(i => i.id === STATE.activeLabOrderId);
  if (!lab) return;
  
  lab.value = val;
  lab.comments = notes || 'Observations conform to test standards.';
  lab.status = 'Final';
  lab.returnToDoctor = true;
  lab.date = new Date().toISOString();
  
  convex.mutation(api.db.upsertInvestigation, lab)
    .then(() => {
      logAudit('Create', lab.id, `Report finalized for Lab Test: ${lab.testName} (Value: ${val})`);
      showToast("Lab report compiled and sent to treating doctor.");
      // Check if ALL investigations for this patient are now Final
      routePatientBackIfAllDone(lab.patientId);
    })
    .catch(err => {
      console.error(err);
      showToast("Error finalizing lab report: " + err.message, "error");
    });
  
  // Reset
  document.getElementById('lab-workspace').style.display = 'none';
  document.getElementById('lab-empty-state').style.display = 'flex';
  STATE.activeLabOrderId = null;
  
  renderLabQueue();
});

// ==========================================
// 11. MODULE: RADIOLOGY WORKFLOWS
// ==========================================

function renderRadiologyQueue() {
  const list = document.getElementById('radiology-pending-list');
  list.innerHTML = '';
  
  const pendingRadio = STATE.investigations.filter(i => i.type === 'Radiology' && i.status === 'Pending');
  
  if (pendingRadio.length === 0) {
    list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No pending radiology imaging requests.</p>`;
    return;
  }
  
  pendingRadio.forEach(r => {
    const card = document.createElement('div');
    card.className = `record-item-card ${STATE.activeRadioOrderId === r.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="record-item-title">${r.testName}</div>
      <div class="record-item-subtitle">
        <span>Patient: ${getPatientName(r.patientId)}</span>
        <span class="status-indicator status-active" style="padding:2px 6px; font-size:0.65rem; border:none;">${r.urgency || 'Routine'}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('#radiology-pending-list .record-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectRadioOrder(r.id);
    });
    list.appendChild(card);
  });
}

function selectRadioOrder(orderId) {
  STATE.activeRadioOrderId = orderId;
  const rad = STATE.investigations.find(i => i.id === orderId);
  if (!rad) return;
  
  document.getElementById('radiology-workspace').style.display = 'block';
  document.getElementById('radiology-empty-state').style.display = 'none';
  
  document.getElementById('radiology-active-study-name').textContent = rad.testName;
  document.getElementById('radiology-active-patient-details').value = `${getPatientName(rad.patientId)} (${rad.patientId})`;
  document.getElementById('radiology-active-urgency').value = rad.urgency || 'Routine';
  
  document.getElementById('radiology-report-text').value = '';
  document.getElementById('radiology-report-status').value = 'Final';
  
  // Reset dropzone image preview
  document.getElementById('radiology-image-preview').style.display = 'none';
  document.getElementById('radiology-dropzone').style.display = 'block';
  document.getElementById('radiology-file-input').value = '';
}

// Radiology Image Upload drops simulation
const dropzone = document.getElementById('radiology-dropzone');
const fileInput = document.getElementById('radiology-file-input');

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    loadMockRadiologyImage(file);
  }
});

function loadMockRadiologyImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('radiology-preview-img').src = e.target.result;
    document.getElementById('radiology-image-preview').style.display = 'flex';
    document.getElementById('radiology-dropzone').style.display = 'none';
    showToast("Mock DICOM image scan loaded successfully.");
  };
  reader.readAsDataURL(file);
}

// Dispatch radiology report
document.getElementById('btn-radiology-submit').addEventListener('click', () => {
  const text = document.getElementById('radiology-report-text').value;
  const status = document.getElementById('radiology-report-status').value;
  const urgency = document.getElementById('radiology-active-urgency').value;
  
  if (!text) {
    showToast("Please enter the radiologist diagnostic evaluation report.", "error");
    return;
  }
  
  const rad = STATE.investigations.find(i => i.id === STATE.activeRadioOrderId);
  if (!rad) return;
  
  rad.comments = text;
  rad.status = status;
  rad.urgency = urgency;
  rad.date = new Date().toISOString();
  
  // Capture image preview details if uploaded, else seed a placeholder
  const previewImg = document.getElementById('radiology-preview-img');
  if (previewImg.src && !previewImg.src.endsWith('/')) {
    rad.image = previewImg.src;
  } else {
    // Standard dummy clean XRay
    rad.image = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200" style="background:%23050505;"><text x="50%22 y="50%22 fill="%23888" font-family="sans-serif" font-size="12" text-anchor="middle">SIMULATED CHEST X-RAY SCAN</text><path d="M70,50 Q110,20 120,180" stroke="%23333" stroke-width="8" fill="none"/><path d="M230,50 Q190,20 180,180" stroke="%23333" stroke-width="8" fill="none"/></svg>';
  }
  
  rad.status = 'Final';
  rad.returnToDoctor = true;
  convex.mutation(api.db.upsertInvestigation, rad)
    .then(() => {
      logAudit('Create', rad.id, `Uploaded radiology report for ${rad.testName} (Status: ${status})`);
      showToast("Imaging report finalized and sent to treating doctor.");
      routePatientBackIfAllDone(rad.patientId);
    })
    .catch(err => {
      console.error(err);
      showToast("Error saving radiology report: " + err.message, "error");
    });
  
  // Reset workspace
  document.getElementById('radiology-workspace').style.display = 'none';
  document.getElementById('radiology-empty-state').style.display = 'flex';
  STATE.activeRadioOrderId = null;
  
  renderRadiologyQueue();
});

// ==========================================
// 12. MODULE: PHARMACY WORKFLOWS
// ==========================================

function renderPharmacyQueue() {
  const list = document.getElementById('pharmacy-pending-list');
  list.innerHTML = '';
  
  const activeRx = STATE.investigations.filter(i => i.type === 'Prescription' && i.status === 'Pending');
  
  if (activeRx.length === 0) {
    list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No pending drug prescriptions.</p>`;
    return;
  }
  
  activeRx.forEach(rx => {
    const card = document.createElement('div');
    card.className = `record-item-card ${STATE.activePrescriptionId === rx.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="record-item-title">Prescription: ${getPatientName(rx.patientId)}</div>
      <div class="record-item-subtitle">
        <span>Prescribed by: ${rx.doctorName}</span>
        <span>ID: ${rx.id}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('#pharmacy-pending-list .record-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectPharmacyOrder(rx.id);
    });
    list.appendChild(card);
  });
}

function selectPharmacyOrder(orderId) {
  STATE.activePrescriptionId = orderId;
  const rx = STATE.investigations.find(i => i.id === orderId);
  if (!rx) return;
  
  document.getElementById('pharmacy-workspace').style.display = 'block';
  document.getElementById('pharmacy-empty-state').style.display = 'none';
  
  document.getElementById('pharmacy-active-patient-name').textContent = getPatientName(rx.patientId);
  
  // Render prescription rows
  const tbody = document.getElementById('pharmacy-dispense-table-body');
  tbody.innerHTML = '';
  
  let lowStockAlert = false;
  
  rx.medicines.forEach((med, idx) => {
    // Simulated stock alert for Amoxicillin
    const isLowStock = med.name.includes('Amoxicillin');
    if (isLowStock) lowStockAlert = true;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="text-bold">${med.name.replace('Medication - ', '')}</span>
        ${isLowStock ? '<span class="status-indicator status-canceled" style="padding:1px 6px; font-size:0.6rem; margin-left:6px;">Low Stock</span>' : ''}
      </td>
      <td>${med.dose} | ${med.freq}</td>
      <td>${med.duration}</td>
      <td>
        <select class="role-select" style="padding:2px 28px 2px 6px; font-size:0.8rem;" onchange="updateDispenseStatus(${idx}, this.value)">
          <option value="Dispensed">Dispense Full</option>
          <option value="Partially Dispensed">Partial</option>
          <option value="Not Available" ${isLowStock ? 'selected' : ''}>Not Available</option>
        </select>
      </td>
      <td>
        <input type="text" placeholder="Reason/Substitute" style="padding:4px 6px; font-size:0.8rem;" id="pharmacy-sub-${idx}" value="${isLowStock ? 'Amoxicillin Gen' : ''}">
      </td>
    `;
    tbody.appendChild(tr);
  });

  const warningDiv = document.getElementById('pharmacy-inventory-warning');
  if (lowStockAlert) {
    warningDiv.textContent = "Caution: Low inventory detected for Amoxicillin 500mg. Substitute with generic alternatives if required.";
    warningDiv.parentElement.parentElement.style.display = 'block';
  } else {
    warningDiv.textContent = "Inventory Levels Stable";
    warningDiv.parentElement.parentElement.style.display = 'none';
  }
}

window.updateDispenseStatus = function(idx, val) {
  // Simple callback placeholder
};

// Complete dispense
document.getElementById('btn-pharmacy-complete').addEventListener('click', () => {
  const rx = STATE.investigations.find(i => i.id === STATE.activePrescriptionId);
  if (!rx) return;
  
  rx.status = 'Final';
  const patientName = getPatientName(rx.patientId);
  
  convex.mutation(api.db.upsertInvestigation, rx)
    .then(() => {
      logAudit('Edit', rx.id, `Fulfilled prescription dispensation checklist for: ${patientName}`);
      showToast("Prescription medicines dispensed. Receipt logged.");
    })
    .catch(err => {
      console.error(err);
      showToast("Error dispensing prescription: " + err.message, "error");
    });
  
  document.getElementById('pharmacy-workspace').style.display = 'none';
  document.getElementById('pharmacy-empty-state').style.display = 'flex';
  STATE.activePrescriptionId = null;
  
  renderPharmacyQueue();
});

// Print label
document.getElementById('btn-pharmacy-print-slip').addEventListener('click', () => {
  showToast("Dispensation labels sent to labeller.", "info");
});

// ==========================================
// 13. MODULE: FINANCE, BILLING & INSURANCE
// ==========================================

function renderFinanceQueue() {
  const list = document.getElementById('finance-billing-list');
  list.innerHTML = '';
  
  const pendingBills = STATE.billingInvoices.filter(b => b.status === 'Pending');
  
  if (pendingBills.length === 0) {
    list.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No outstanding patient invoices.</p>`;
    return;
  }
  
  pendingBills.forEach(bill => {
    const card = document.createElement('div');
    card.className = `record-item-card ${STATE.activeBillId === bill.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="record-item-title">${getPatientName(bill.patientId)}</div>
      <div class="record-item-subtitle">
        <span>Due: ₹${bill.total}</span>
        <span>ID: ${bill.id}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('#finance-billing-list .record-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectFinanceBill(bill.id);
    });
    list.appendChild(card);
  });
}

function selectFinanceBill(billId) {
  STATE.activeBillId = billId;
  const bill = STATE.billingInvoices.find(b => b.id === billId);
  if (!bill) return;
  
  document.getElementById('finance-workspace').style.display = 'block';
  document.getElementById('finance-empty-state').style.display = 'none';
  
  document.getElementById('finance-active-patient-name').textContent = getPatientName(bill.patientId);
  
  // Render invoice lines
  const tbody = document.getElementById('finance-bill-items-body');
  tbody.innerHTML = '';
  
  bill.items.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="text-bold">${item.serviceName.replace('Medication - ', '')}</span></td>
      <td>${item.qty}</td>
      <td>₹${item.rate}</td>
      <td>₹${item.amount}</td>
      <td>
        <button class="glass-btn glass-btn-danger" style="padding:2px 6px; font-size:0.7rem;" onclick="removeBillItem(${idx})">&times;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Setup values
  document.getElementById('finance-bill-subtotal').textContent = `₹${bill.subtotal}`;
  document.getElementById('finance-bill-gst').textContent = `₹${bill.gst}`;
  document.getElementById('finance-bill-total').textContent = `₹${bill.total}`;
  
  // Handle insurance UI toggle
  const selectMode = document.getElementById('finance-payment-mode');
  selectMode.value = 'Cash';
  document.getElementById('finance-insurance-details-panel').style.display = 'none';
  document.getElementById('finance-bill-insurance-deduct').textContent = `-₹0.00`;
  
  selectMode.addEventListener('change', handlePaymentModeChange);
}

function handlePaymentModeChange(e) {
  const panel = document.getElementById('finance-insurance-details-panel');
  const bill = STATE.billingInvoices.find(b => b.id === STATE.activeBillId);
  if (!bill) return;
  
  if (e.target.value === 'Insurance TPA Cover') {
    panel.style.display = 'block';
    
    // Simulate preauth cover of 80%
    const cover = Math.round(bill.total * 0.8);
    const remainder = bill.total - cover;
    
    document.getElementById('finance-bill-insurance-deduct').textContent = `-₹${cover}`;
    document.getElementById('finance-bill-total').textContent = `₹${remainder}`;
    
    document.getElementById('finance-preauth-number').value = 'COV-' + Math.floor(100000 + Math.random() * 900000);
    document.getElementById('finance-preauth-approved').checked = true;
  } else {
    panel.style.display = 'none';
    document.getElementById('finance-bill-insurance-deduct').textContent = `-₹0.00`;
    document.getElementById('finance-bill-total').textContent = `₹${bill.total}`;
  }
}

window.removeBillItem = function(idx) {
  const bill = STATE.billingInvoices.find(b => b.id === STATE.activeBillId);
  if (!bill) return;
  
  bill.items.splice(idx, 1);
  
  // Recalculate
  bill.subtotal = bill.items.reduce((sum, item) => sum + item.amount, 0);
  bill.gst = Math.round(bill.subtotal * 0.05);
  bill.total = bill.subtotal + bill.gst;
  
  convex.mutation(api.db.upsertBillingInvoice, bill)
    .then(() => {
      selectFinanceBill(bill.id);
    })
    .catch(err => {
      console.error(err);
      showToast("Error saving invoice: " + err.message, "error");
    });
};

// Checkout invoice
document.getElementById('btn-finance-checkout').addEventListener('click', () => {
  const bill = STATE.billingInvoices.find(b => b.id === STATE.activeBillId);
  if (!bill) return;
  
  const payMode = document.getElementById('finance-payment-mode').value;
  
  if (payMode === 'Insurance TPA Cover') {
    const isApproved = document.getElementById('finance-preauth-approved').checked;
    const ref = document.getElementById('finance-preauth-number').value;
    if (!isApproved || !ref) {
      showToast("Pre-Authorization must be approved by TPA to settle insurance invoice.", "error");
      return;
    }
    bill.preAuthApproved = true;
    bill.preAuthNum = ref;
  }
  
  bill.status = 'Paid';
  bill.paymentMode = payMode;
  
  convex.mutation(api.db.upsertBillingInvoice, bill)
    .then(() => {
      logAudit('Create', bill.id, `Settled patient invoice via payment mode: ${payMode}`);
      showToast("Payment processed. GST Invoice marked as settled.");
    })
    .catch(err => {
      console.error(err);
      showToast("Settle invoice failed: " + err.message, "error");
    });
  
  document.getElementById('finance-workspace').style.display = 'none';
  document.getElementById('finance-empty-state').style.display = 'flex';
  STATE.activeBillId = null;
  
  renderFinanceQueue();
});

// Print invoice preview simulator
document.getElementById('btn-finance-print-invoice').addEventListener('click', () => {
  const bill = STATE.billingInvoices.find(b => b.id === STATE.activeBillId);
  if (!bill) return;
  
  const viewer = document.getElementById('modal-file-viewer');
  document.getElementById('file-viewer-title').textContent = `GST Invoice Settle Checklist`;
  
  const lines = bill.items.map(item => `
    <span>${item.serviceName.padEnd(30, ' ')} ${item.qty}   ₹${String(item.rate).padEnd(6, ' ')}   ₹${item.amount}</span>
  `).join('\n');
  
  document.getElementById('file-viewer-body').innerHTML = `
    <pre class="print-invoice-preview">
==========================================
          AURATRAL HEALTHOS EHR
       Auratral Dataspace Pvt Ltd.
==========================================
Invoice Ref: ${bill.id}
Date: ${new Date(bill.date).toLocaleString()}
Patient: ${getPatientName(bill.patientId)} (${bill.patientId})
------------------------------------------
Item Description               Qty  Rate     Sub
------------------------------------------
${lines}
------------------------------------------
Subtotal:                             ₹${bill.subtotal}
GST (5%):                             ₹${bill.gst}
==========================================
GRAND TOTAL DUE:                      ₹${bill.total}
==========================================
Payment Mode Selected: ${document.getElementById('finance-payment-mode').value}
Pre-Auth Reference: ${document.getElementById('finance-preauth-number').value || 'N/A'}
Status: UNPAID DRAFT PREVIEW
==========================================
    </pre>
  `;
  viewer.classList.add('open');
});

// ==========================================
// 14. MODULE: PATIENT PORTAL (Simulated Mobile PWA)
// ==========================================

function renderPatientPortalPWA() {
  const container = document.getElementById('phone-screen-viewport');
  
  // Set real-time clock inside phone
  const now = new Date();
  document.getElementById('phone-clock').textContent = now.toTimeString().slice(0, 5);
  
  // Auto-login: bypass OTP, use first patient or create demo patient
  if (!STATE.patientPWA.isLoggedIn) {
    if (STATE.patients.length > 0) {
      STATE.patientPWA.isLoggedIn = true;
      STATE.patientPWA.activePatientId = STATE.patients[0].id;
      STATE.patientPWA.mobileNumber = STATE.patients[0].mobile;
    } else {
      // No patients yet - show a welcome screen instead of OTP
      container.innerHTML = `
        <div class="pwa-header">
          <span class="pwa-header-title">Auratral HealthOS</span>
        </div>
        <div class="pwa-body" style="justify-content:center; align-items:center; text-align:center;">
          <div style="padding: 20px;">
            <div style="width:64px; height:64px; border-radius:50%; background:var(--light-purple); display:flex; align-items:center; justify-content:center; margin:0 auto 16px; color:var(--primary);">
              <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <h3 style="font-family:'Space Grotesk',sans-serif; color:var(--primary); margin-bottom:8px;">Welcome to HealthOS</h3>
            <p style="font-size:0.8rem; color:var(--text-2); line-height:1.5;">No patients registered yet. Register a patient via the Reception desk to see the mobile portal experience.</p>
          </div>
        </div>
      `;
      return;
    }
  }
  
  // Render main portal frame
  const p = STATE.patients.find(pt => pt.id === STATE.patientPWA.activePatientId);
  if (!p) {
    STATE.patientPWA.isLoggedIn = false;
    renderPatientPortalPWA();
    return;
  }
  
  container.innerHTML = `
    <!-- PWA Brand header -->
    <div class="pwa-header">
      <span class="pwa-header-title">Auratral HealthOS</span>
      <span class="abha-logo-mini" style="background:white; color:var(--primary); font-weight:800; font-size:0.6rem; width:16px; height:16px;">H</span>
    </div>
    
    <!-- Dynamic tab body -->
    <div class="pwa-body" id="pwa-tab-content">
      <!-- Loaded dynamically -->
    </div>
    
    <!-- Tab navigation -->
    <div class="pwa-tab-bar">
      <div class="pwa-tab-item ${STATE.patientPWA.currentTab==='home'?'active':''}" onclick="switchPatientPWATab('home')">
        <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        <span>Home</span>
      </div>
      <div class="pwa-tab-item ${STATE.patientPWA.currentTab==='records'?'active':''}" onclick="switchPatientPWATab('records')">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        <span>Records</span>
      </div>
      <div class="pwa-tab-item ${STATE.patientPWA.currentTab==='consent'?'active':''}" onclick="switchPatientPWATab('consent')">
        <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        <span>Consent</span>
      </div>
      <div class="pwa-tab-item ${STATE.patientPWA.currentTab==='profile'?'active':''}" onclick="switchPatientPWATab('profile')">
        <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        <span>Profile</span>
      </div>
    </div>
  `;
  
  renderPatientPWAActiveTab(p);
}

function renderMobileLogin(container) {
  container.innerHTML = `
    <div class="mobile-otp-screen">
      <div class="mobile-otp-icon">
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
      </div>
      <h3 style="font-family:'Outfit'; margin-bottom:8px;">Patient Self-Service</h3>
      <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:20px;">Secure Mobile OTP sign-in. Access diagnostics reports and manage consents.</p>
      
      ${!STATE.patientPWA.otpSent ? `
        <div class="form-group" style="width:100%; text-align:left; margin-bottom:16px;">
          <label>Registered Mobile Number</label>
          <input type="tel" id="pwa-login-mobile" placeholder="e.g. 9876543210" style="padding:12px; font-size:1rem;" value="${STATE.patientPWA.mobileNumber}">
        </div>
        <button class="glass-btn glass-btn-primary" style="width:100%; padding:12px;" onclick="triggerPatientOTP()">Get Access OTP</button>
      ` : `
        <div class="form-group" style="width:100%; text-align:left; margin-bottom:16px;">
          <label>Enter 6-digit OTP code</label>
          <input type="text" id="pwa-login-otp" placeholder="Enter code" style="padding:12px; font-size:1.2rem; text-align:center; letter-spacing:0.2em; font-weight:700;">
          <span style="font-size:0.7rem; color:var(--success); display:block; margin-top:6px; text-align:center;">Demo Code: 123456</span>
        </div>
        <button class="glass-btn glass-btn-primary" style="width:100%; padding:12px;" onclick="verifyPatientOTP()">Confirm & Login</button>
        <button class="glass-btn glass-btn-secondary" style="width:100%; padding:8px; margin-top:8px; font-size:0.75rem;" onclick="resetPatientOTP()">Back</button>
      `}
    </div>
  `;
}

window.triggerPatientOTP = function() {
  const mob = document.getElementById('pwa-login-mobile').value;
  if (!mob) {
    showToast("Please input a registered mobile number.", "error");
    return;
  }
  
  // Check if patient exists
  const exists = STATE.patients.find(pt => pt.mobile === mob);
  if (!exists) {
    showToast("Mobile number not registered in hospital database.", "error");
    return;
  }
  
  STATE.patientPWA.mobileNumber = mob;
  STATE.patientPWA.otpSent = true;
  STATE.patientPWA.activePatientId = exists.id;
  
  logAudit('View', exists.id, `Patient requested mobile portal access OTP token.`);
  showToast("A mock login OTP code has been dispatched.");
  renderPatientPortalPWA();
};

window.verifyPatientOTP = function() {
  const code = document.getElementById('pwa-login-otp').value;
  if (code !== '123456') {
    showToast("Incorrect verification code. Please input 123456.", "error");
    return;
  }
  
  STATE.patientPWA.isLoggedIn = true;
  
  logAudit('View', STATE.patientPWA.activePatientId, `Patient logged into mobile PWA portal.`);
  showToast("Logged in successfully!");
  renderPatientPortalPWA();
};

window.resetPatientOTP = function() {
  STATE.patientPWA.otpSent = false;
  renderPatientPortalPWA();
};

window.switchPatientPWATab = function(tab) {
  STATE.patientPWA.currentTab = tab;
  renderPatientPortalPWA();
};

// Render active portal content page
function renderPatientPWAActiveTab(p) {
  const content = document.getElementById('pwa-tab-content');
  content.innerHTML = '';
  
  if (STATE.patientPWA.currentTab === 'home') {
    // Upcoming appointments
    const pApts = STATE.appointments.filter(a => a.patientId === p.id);
    const activeApt = pApts.find(a => a.status !== 'Done');
    
    content.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
        <div class="user-avatar" style="width:48px; height:48px; font-size:1.2rem;">${p.name[0]}</div>
        <div>
          <h4 style="font-size:1.1rem; color:var(--primary);">Hello, ${p.name.split(' ')[0]}</h4>
          <span style="font-size:0.75rem; color:var(--text-2);">ID: ${p.id}</span>
        </div>
      </div>
      
      ${p.abhaId ? `
        <div class="pwa-card" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:white;">
          <div class="flex-between">
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase;">ABHA DIGITAL HEALTH CARD</span>
            <span class="abha-logo-mini">A</span>
          </div>
          <div style="font-size:1rem; font-weight:800; margin-top:14px;">${p.abhaId}</div>
          <div style="font-size:0.7rem; opacity:0.8; margin-top:2px;">Linked to Auratral HealthOS</div>
        </div>
      ` : `
        <div class="pwa-card" style="border:1px dashed var(--danger); background:rgba(239,68,68,0.02); text-align:center;">
          <span style="font-size:0.8rem; font-weight:700; color:var(--danger); display:block; margin-bottom:4px;">ABHA Identity Not Linked</span>
          <p style="font-size:0.7rem; color:var(--text-2); margin-bottom:10px;">Verify your identity under the Profile tab or at the front desk.</p>
        </div>
      `}
      
      <!-- Appointment Widget -->
      <div class="pwa-card">
        <span class="pwa-card-title">Next Scheduled Appointment</span>
        ${activeApt ? `
          <div style="margin-top:6px;">
            <div style="font-size:0.95rem; font-weight:700; color:var(--primary);">${activeApt.type}</div>
            <div style="font-size:0.8rem; color:var(--text-2); margin-top:2px;">
              Doctor ID: ${activeApt.doctorId} | Token #${activeApt.token}<br>
              Date: ${activeApt.date} | Time: ${activeApt.time}
            </div>
            <span class="status-indicator status-active" style="margin-top:8px; font-size:0.65rem; padding:2px 8px;">${activeApt.status}</span>
          </div>
        ` : `
          <p style="font-size:0.8rem; color:var(--text-2); margin-top:4px;">No upcoming consult slots scheduled.</p>
        `}
      </div>

      <div class="pwa-card" style="text-align:center; padding:12px;">
        <button class="glass-btn glass-btn-primary" style="width:100%; font-size:0.8rem;" onclick="showToast('Online booking is locked in v1.0 sandbox', 'info')">Schedule New Visit Slot</button>
      </div>
    `;
  }
  
  else if (STATE.patientPWA.currentTab === 'records') {
    const clinicals = STATE.clinicalRecords.filter(c => c.patientId === p.id);
    const investigations = STATE.investigations.filter(i => i.patientId === p.id && i.status === 'Final');
    const bills = STATE.billingInvoices.filter(b => b.patientId === p.id);
    
    let html = `<h4 style="font-size:0.95rem; color:var(--primary); border-bottom:1px solid rgba(70,15,117,0.08); padding-bottom:6px;">Digital Medical Records</h4>`;
    
    if (clinicals.length === 0 && investigations.length === 0 && bills.length === 0) {
      html += `<p style="text-align:center; padding:30px; font-size:0.8rem; color:var(--text-2);">No medical file logs detected in hospital repository.</p>`;
    } else {
      // Clinical soap
      clinicals.forEach(c => {
        html += `
          <div class="pwa-card">
            <div class="flex-between">
              <span class="status-indicator status-done" style="font-size:0.6rem; padding:1px 6px;">Clinical Note</span>
              <small class="text-muted" style="font-size:0.7rem;">${new Date(c.date).toLocaleDateString()}</small>
            </div>
            <div style="font-size:0.8rem; margin-top:8px;">
              <strong>Diagnoses:</strong> ${c.a.join(', ')}
            </div>
            <button class="glass-btn glass-btn-secondary" style="padding:2px 8px; font-size:0.7rem; width:100%; margin-top:8px; justify-content:center;" onclick="viewClinicalDocument('${c.id}')">Download PDF</button>
          </div>
        `;
      });
      
      // Labs & Radiology
      investigations.forEach(inv => {
        html += `
          <div class="pwa-card">
            <div class="flex-between">
              <span class="status-indicator status-active" style="font-size:0.6rem; padding:1px 6px;">${inv.type} Report</span>
              <small class="text-muted" style="font-size:0.7rem;">${new Date(inv.date).toLocaleDateString()}</small>
            </div>
            <div style="font-size:0.8rem; margin-top:6px;">
              <strong>Study Name:</strong> ${inv.testName}
            </div>
            <button class="glass-btn glass-btn-secondary" style="padding:2px 8px; font-size:0.7rem; width:100%; margin-top:8px; justify-content:center;" onclick="viewInvestigationDocument('${inv.id}')">Download Report</button>
          </div>
        `;
      });

      // Bills
      bills.forEach(bill => {
        html += `
          <div class="pwa-card">
            <div class="flex-between">
              <span class="status-indicator status-booked" style="font-size:0.6rem; padding:1px 6px; color:var(--primary); background:var(--light-purple);">${bill.status} Invoice</span>
              <small class="text-muted" style="font-size:0.7rem;">${new Date(bill.date).toLocaleDateString()}</small>
            </div>
            <div style="font-size:0.8rem; margin-top:6px;">
              <strong>GST Invoice:</strong> ${bill.id} | Total: ₹${bill.total}
            </div>
            <button class="glass-btn glass-btn-secondary" style="padding:2px 8px; font-size:0.7rem; width:100%; margin-top:8px; justify-content:center;" onclick="showPwaInvoice('${bill.id}')">View GST Bill</button>
          </div>
        `;
      });
    }
    
    content.innerHTML = `<div style="display:flex; flex-direction:column; gap:12px; width:100%;">${html}</div>`;
  }
  
  else if (STATE.patientPWA.currentTab === 'consent') {
    content.innerHTML = `
      <h4 style="font-size:0.95rem; color:var(--primary); border-bottom:1px solid rgba(70,15,117,0.08); padding-bottom:6px; margin-bottom:10px;">DPDP Consent Configuration</h4>
      <p style="font-size:0.75rem; color:var(--text-2); line-height:1.4; margin-bottom:12px;">
        Manage your choices regarding de-identified medical history sharing for clinical research and academic pipeline under DPDP Act 2023.
      </p>
      
      <div class="pwa-card">
        <label style="display:flex; align-items:center; justify-content:between; font-weight:700; text-transform:none; font-size:0.8rem; cursor:pointer;">
          <div style="flex:1; margin-right:10px;">
            <span style="color:var(--primary); font-weight:700; display:block;">Academic & Medical Studies</span>
            <small style="font-weight:500; color:var(--text-2); display:block; margin-top:2px;">De-identified sharing for university clinical trials</small>
          </div>
          <input type="checkbox" id="pwa-consent-academic" ${p.consentAcademic?'checked':''} onchange="togglePwaConsent('${p.id}', 'consentAcademic')">
        </label>
      </div>

      <div class="pwa-card">
        <label style="display:flex; align-items:center; justify-content:between; font-weight:700; text-transform:none; font-size:0.8rem; cursor:pointer;">
          <div style="flex:1; margin-right:10px;">
            <span style="color:var(--primary); font-weight:700; display:block;">Commercial AI/ML Models</span>
            <small style="font-weight:500; color:var(--text-2); display:block; margin-top:2px;">De-identified sharing for training artificial intelligence medical models</small>
          </div>
          <input type="checkbox" id="pwa-consent-commercial" ${p.consentCommercial?'checked':''} onchange="togglePwaConsent('${p.id}', 'consentCommercial')">
        </label>
      </div>

      <div class="pwa-card">
        <label style="display:flex; align-items:center; justify-content:between; font-weight:700; text-transform:none; font-size:0.8rem; cursor:pointer;">
          <div style="flex:1; margin-right:10px;">
            <span style="color:var(--primary); font-weight:700; display:block;">Future Study Contact</span>
            <small style="font-weight:500; color:var(--text-2); display:block; margin-top:2px;">Allow hospital to reach out for research studies participation</small>
          </div>
          <input type="checkbox" id="pwa-consent-future" ${p.consentFuture?'checked':''} onchange="togglePwaConsent('${p.id}', 'consentFuture')">
        </label>
      </div>
      
      <span style="font-size:0.65rem; color:var(--text-2); text-align:center; display:block; margin-top:6px;">Changes update in system records within 24 hours.</span>
    `;
  }
  
  else if (STATE.patientPWA.currentTab === 'profile') {
    content.innerHTML = `
      <h4 style="font-size:0.95rem; color:var(--primary); border-bottom:1px solid rgba(70,15,117,0.08); padding-bottom:6px; margin-bottom:12px;">Profile Information</h4>
      
      <div class="form-group" style="margin-bottom:10px;">
        <label style="font-size:0.65rem;">Full Name</label>
        <input type="text" value="${p.name}" disabled style="padding:6px 10px; font-size:0.85rem;">
      </div>
      
      <div class="form-group" style="margin-bottom:10px;">
        <label style="font-size:0.65rem;">Date of Birth</label>
        <input type="text" value="${p.dob}" disabled style="padding:6px 10px; font-size:0.85rem;">
      </div>
      
      <div class="form-group" style="margin-bottom:10px;">
        <label style="font-size:0.65rem;">Mobile Connection</label>
        <input type="text" value="${p.mobile}" disabled style="padding:6px 10px; font-size:0.85rem;">
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label style="font-size:0.65rem;">Emergency Registry Contact</label>
        <input type="text" value="${p.emergency}" style="padding:6px 10px; font-size:0.85rem;" id="pwa-profile-emergency">
      </div>

      <button class="glass-btn glass-btn-primary" style="width:100%; font-size:0.8rem; padding:10px;" onclick="savePatientPwaProfile('${p.id}')">Save Profile Updates</button>
      
      <button class="glass-btn glass-btn-danger" style="width:100%; font-size:0.8rem; padding:6px; margin-top:14px; justify-content:center;" onclick="logoutPatientPWA()">Logout Portal</button>
    `;
  }
}

window.togglePwaConsent = function(pId, field) {
  const p = STATE.patients.find(pt => pt.id === pId);
  if (!p) return;
  
  p[field] = !p[field];
  mutatePatient(p)
    .then(() => {
      logAudit('Edit', p.id, `Patient updated research data consent: ${field} = ${p[field]}`);
      showToast("Consent preferences updated.");
    })
    .catch(err => {
      console.error(err);
      showToast("Failed to update consent: " + err.message, "error");
    });
};

window.savePatientPwaProfile = function(pId) {
  const p = STATE.patients.find(pt => pt.id === pId);
  if (!p) return;
  
  const val = document.getElementById('pwa-profile-emergency').value;
  p.emergency = val;
  mutatePatient(p)
    .then(() => {
      logAudit('Edit', p.id, `Patient updated emergency contact information`);
      showToast("Profile details saved successfully.");
    })
    .catch(err => {
      console.error(err);
      showToast("Failed to save profile: " + err.message, "error");
    });
};

window.logoutPatientPWA = function() {
  STATE.patientPWA.isLoggedIn = false;
  STATE.patientPWA.otpSent = false;
  STATE.patientPWA.activePatientId = null;
  showToast("Logged out of patient portal.");
  renderPatientPortalPWA();
};

window.showPwaInvoice = function(billId) {
  const bill = STATE.billingInvoices.find(b => b.id === billId);
  if (!bill) return;
  
  const viewer = document.getElementById('modal-file-viewer');
  document.getElementById('file-viewer-title').textContent = `Invoice Receipt`;
  
  const lines = bill.items.map(item => `
    <div class="flex-between" style="font-size:0.8rem; margin-bottom:4px;">
      <span>${item.serviceName.replace('Medication - ', '')}</span>
      <span>₹${item.amount}</span>
    </div>
  `).join('');

  document.getElementById('file-viewer-body').innerHTML = `
    <div style="background:white; padding:20px; width:100%; border-radius:8px; line-height:1.6;">
      <div style="text-align:center; margin-bottom:14px;">
        <h4 style="color:var(--primary);">AURATRAL HEALTHOS RECEIPT</h4>
        <small class="text-muted">GST Registered Invoice Receipt</small>
      </div>
      <hr style="margin:8px 0; border:none; border-top:1px dashed #ddd;">
      <p style="font-size:0.75rem;"><strong>Bill ID:</strong> ${bill.id}<br><strong>Date:</strong> ${new Date(bill.date).toLocaleString()}</p>
      <hr style="margin:8px 0; border:none; border-top:1px dashed #ddd;">
      ${lines}
      <hr style="margin:8px 0; border:none; border-top:1px dashed #ddd;">
      <div class="flex-between" style="font-size:0.85rem; font-weight:700;">
        <span>Grand Total Settle</span>
        <span>₹${bill.total}</span>
      </div>
      <div style="margin-top:14px; text-align:center;">
        <span class="status-indicator status-done" style="font-size:0.65rem;">Paid: ${bill.paymentMode || 'Cash'}</span>
      </div>
    </div>
  `;
  viewer.classList.add('open');
};

// ==========================================
// 15. GLOBAL QUICK SEARCH
// ==========================================

function initGlobalSearch() {
  const input = document.getElementById('global-patient-search');
  const dropdown = document.getElementById('global-search-results');
  
  input.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    dropdown.innerHTML = '';
    
    if (!val) {
      dropdown.style.display = 'none';
      return;
    }
    
    const matches = STATE.patients.filter(p => 
      p.id.toLowerCase().includes(val) || 
      p.name.toLowerCase().includes(val) ||
      p.mobile.toLowerCase().includes(val)
    );
    
    if (matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    matches.forEach(p => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.innerHTML = `<strong>${p.name}</strong> (${p.id}) — ${p.mobile}`;
      div.addEventListener('click', () => {
        handleGlobalSearchSelection(p.id);
        input.value = '';
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(div);
    });
    
    dropdown.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== dropdown) {
      dropdown.style.display = 'none';
    }
  });
}

function handleGlobalSearchSelection(pId) {
  // Check active role and route appropriately
  if (STATE.activeRole === 'reception') {
    document.getElementById('appointment-patient-id').value = pId;
    showToast(`Selected patient ID: ${pId} for booking scheduler.`);
  } else if (STATE.activeRole === 'nursing') {
    selectPatientForVitals(pId);
  } else if (STATE.activeRole === 'doctor') {
    // Check if patient has consult appointment active
    const apt = STATE.appointments.find(a => a.patientId === pId && a.status === 'In Consultation');
    if (apt) {
      selectPatientForDoctor(pId);
    } else {
      showToast(`Selected patient does not have an active consulting token in queue.`, "error");
    }
  } else if (STATE.activeRole === 'finance') {
    const bill = STATE.billingInvoices.find(b => b.patientId === pId && b.status === 'Pending');
    if (bill) {
      selectFinanceBill(bill.id);
    } else {
      showToast(`Selected patient does not have any outstanding billing accounts.`, "info");
    }
  } else {
    showToast(`Patient profile: ${pId} queried. Audit logs updated.`, "info");
    logAudit('View', pId, `Admin searched patient health chart history details`);
  }
}

// ==========================================
// 16. LOGIN SYSTEM
// ==========================================

function initLogin() {
  const loginBtn = document.getElementById('btn-login');
  const emailInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error-msg');
  const bootstrapBtn = document.getElementById('btn-bootstrap-db');

  if (bootstrapBtn) {
    bootstrapBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.bootstrapDatabase();
    });
  }

  async function attemptLogin() {
    const email = emailInput.value.trim();
    const pass = passwordInput.value;
    
    if (!email || !pass) {
      errorMsg.textContent = 'Please enter both email and password.';
      return;
    }
    
    try {
      errorMsg.textContent = 'Signing in...';
      await signInWithEmailAndPassword(auth, email, pass);
      errorMsg.textContent = '';
    } catch (error) {
      console.error(error);
      errorMsg.textContent = 'Login failed: ' + error.message;
    }
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', attemptLogin);
  }
  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attemptLogin();
    });
  }
  if (emailInput) {
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') passwordInput.focus();
    });
  }
}

// Global Firebase Logout Handler
window.logoutFirebase = async function() {
  try {
    await signOut(auth);
    showToast("Signed out successfully!");
  } catch (err) {
    console.error(err);
    showToast("Error signing out: " + err.message, "error");
  }
};

// ==========================================
// 17. WEBCAM PHOTO CAPTURE
// ==========================================

let webcamStream = null;

window.openWebcam = function() {
  const modal = document.getElementById('modal-webcam');
  const video = document.getElementById('webcam-video');
  modal.classList.add('open');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })
    .then(stream => {
      webcamStream = stream;
      video.srcObject = stream;
    })
    .catch(err => {
      console.error('Webcam error:', err);
      showToast('Camera access denied. Please allow camera permissions.', 'error');
    });
};

window.closeWebcam = function() {
  const modal = document.getElementById('modal-webcam');
  const video = document.getElementById('webcam-video');
  modal.classList.remove('open');
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  video.srcObject = null;
};

window.capturePhoto = function() {
  const video = document.getElementById('webcam-video');
  const canvas = document.getElementById('webcam-canvas');
  const preview = document.getElementById('patient-photo-preview');
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 240;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  closeWebcam();
  showToast('Photo captured successfully!');
};

// ==========================================
// 18. NOTIFICATION CENTER
// ==========================================

function updateNotificationBell() {
  const countEl = document.getElementById('notification-count');
  const unread = STATE.notifications.filter(n => !n.read).length;
  countEl.textContent = unread;
  countEl.style.display = unread > 0 ? 'flex' : 'none';
}

window.toggleNotifications = function() {
  const dropdown = document.getElementById('notification-dropdown');
  const isVisible = dropdown.style.display === 'block';
  dropdown.style.display = isVisible ? 'none' : 'block';

  if (!isVisible) {
    if (STATE.notifications.length === 0) {
      dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:.78rem">No notifications</div>';
    } else {
      dropdown.innerHTML = STATE.notifications.slice(0, 10).map(n => `
        <div style="padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;${n.read ? '' : 'background:var(--extra-light)'}">
          <div style="font-size:.78rem;font-weight:${n.read ? '400' : '600'};color:var(--text-1)">${n.title}</div>
          <div style="font-size:.68rem;color:var(--text-3);margin-top:2px">${n.message}</div>
          <div style="font-size:.62rem;color:var(--text-3);margin-top:2px">${new Date(n.timestamp).toLocaleString()}</div>
        </div>
      `).join('');
    }
  }
};

// Close notification dropdown on outside click
document.addEventListener('click', (e) => {
  const bell = document.getElementById('notification-bell');
  const dropdown = document.getElementById('notification-dropdown');
  if (bell && dropdown && !bell.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ==========================================
// 19. DEPARTMENT CARDS GRID
// ==========================================

const DEPARTMENTS = [
  { name: 'General Medicine', icon: 'M22 12h-4l-3 9L9 3l-3 9H2', color: '#7C3AED' },
  { name: 'Cardiology', icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z', color: '#DC2626' },
  { name: 'Orthopedics', icon: 'M18 20V10M12 20V4M6 20v-6', color: '#0284C7' },
  { name: 'Pediatrics', icon: 'M9 18V5l12-2v13M9 9l12-2', color: '#059669' },
  { name: 'Radiology', icon: 'M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1', color: '#D97706' },
  { name: 'Pathology', icon: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z', color: '#6D28D9' },
  { name: 'Emergency', icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', color: '#DC2626' },
  { name: 'Nursing Care', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', color: '#EC4899' }
];

function renderDeptCards() {
  const grid = document.getElementById('admin-dept-cards-grid');
  if (!grid) return;
  
  grid.innerHTML = DEPARTMENTS.map(dept => {
    const staffCount = STAFF_ACCOUNTS.filter(s => s.dept.toLowerCase().includes(dept.name.toLowerCase().split(' ')[0])).length;
    const patientCount = STATE.appointments.filter(a => {
      const doc = DOCTORS.find(d => d.id === a.doctorId);
      return doc && doc.dept === dept.name;
    }).length;
    return `
      <div class="dept-card" style="border-left:3px solid ${dept.color};cursor:pointer" onclick="showDeptDetail('${dept.name}')">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${dept.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${dept.icon}"></path></svg>
          <span style="font-weight:600;font-size:.82rem">${dept.name}</span>
        </div>
        <div style="display:flex;gap:12px;font-size:.7rem;color:var(--text-2)">
          <span>${staffCount} staff</span>
          <span>${patientCount} patients today</span>
        </div>
      </div>
    `;
  }).join('');
}

window.showDeptDetail = function(deptName) {
  showToast(`Viewing ${deptName} department details`, 'info');
  logAudit('View', 'DEPT', `Viewed department: ${deptName}`);
};

// ==========================================
// 20. DEVICES & EQUIPMENT TABLE
// ==========================================

const SEED_DEVICES = [
  { id: 'DEV001', name: 'Philips IntelliVue MX800', type: 'Monitor', department: 'ICU', location: 'ICU Bay 1', status: 'Active', serialNumber: 'PH-MX800-2023-001', purchaseDate: '2023-03-15', maintenanceDue: '2026-06-15', lastMaintenance: '2026-03-15', warranty: '2025-03-15', notes: 'Cardiac monitoring' },
  { id: 'DEV002', name: 'GE Vivid E95', type: 'Ultrasound', department: 'Cardiology', location: 'Echo Room 1', status: 'Active', serialNumber: 'GE-E95-2024-004', purchaseDate: '2024-01-10', maintenanceDue: '2026-07-10', lastMaintenance: '2026-01-10', warranty: '2027-01-10', notes: 'Echocardiography' },
  { id: 'DEV003', name: 'Siemens SOMATOM go.Up', type: 'CT Scanner', department: 'Radiology', location: 'CT Suite', status: 'Active', serialNumber: 'SI-CT-2022-012', purchaseDate: '2022-06-20', maintenanceDue: '2026-06-20', lastMaintenance: '2026-04-20', warranty: '2025-06-20', notes: '128-slice CT' },
  { id: 'DEV004', name: 'Mindray SV300', type: 'Ventilator', department: 'ICU', location: 'ICU Bay 3', status: 'Under Maintenance', serialNumber: 'MR-SV300-2023-008', purchaseDate: '2023-07-01', maintenanceDue: '2026-05-01', lastMaintenance: '2026-05-28', warranty: '2026-07-01', notes: 'Turbine replacement' },
  { id: 'DEV005', name: 'Roche Cobas c311', type: 'Analyzer', department: 'Pathology', location: 'Lab Room 2', status: 'Active', serialNumber: 'RC-C311-2024-003', purchaseDate: '2024-04-01', maintenanceDue: '2026-10-01', lastMaintenance: '2026-04-01', warranty: '2027-04-01', notes: 'Clinical chemistry' },
  { id: 'DEV006', name: 'BPL ECG 108T Digi', type: 'ECG', department: 'Cardiology', location: 'OPD Room 5', status: 'Active', serialNumber: 'BPL-ECG-2023-015', purchaseDate: '2023-09-15', maintenanceDue: '2026-09-15', lastMaintenance: '2026-03-15', warranty: '2025-09-15', notes: '12-lead ECG' },
  { id: 'DEV007', name: 'Tuttnauer 3870EA', type: 'Autoclave', department: 'CSSD', location: 'Sterilization', status: 'Active', serialNumber: 'TU-3870-2024-001', purchaseDate: '2024-02-28', maintenanceDue: '2026-08-28', lastMaintenance: '2026-02-28', warranty: '2027-02-28', notes: 'Fully automatic' },
  { id: 'DEV008', name: 'Schiller Defigard 5000', type: 'Defibrillator', department: 'Emergency', location: 'ER Crash Cart', status: 'Active', serialNumber: 'SC-DG5000-2023-002', purchaseDate: '2023-11-01', maintenanceDue: '2026-11-01', lastMaintenance: '2026-05-01', warranty: '2026-11-01', notes: 'AED + manual mode' }
];

const SEED_COMPLAINTS = [
  { id: 'TKT001', title: 'MRI cooling system leak', category: 'Device Malfunction', department: 'Radiology', priority: 'Critical', status: 'Open', reportedBy: 'Dr. Sunita Rao', assignedTo: 'Biomedical Team', description: 'Coolant leak detected near the MRI bore. Room temperature rising.', resolution: '', createdAt: '2026-05-28T09:15:00Z', resolvedAt: '' },
  { id: 'TKT002', title: 'OPD AC not working', category: 'Infrastructure', department: 'Reception', priority: 'Medium', status: 'In Progress', reportedBy: 'Kiran G.', assignedTo: 'Maintenance', description: 'Air conditioning unit in OPD waiting area has stopped functioning.', resolution: '', createdAt: '2026-05-27T14:30:00Z', resolvedAt: '' },
  { id: 'TKT003', title: 'HIS system slow response', category: 'IT/Software', department: 'Billing', priority: 'High', status: 'Open', reportedBy: 'Divya Iyer', assignedTo: 'IT Support', description: 'Billing module takes over 30s to load patient records.', resolution: '', createdAt: '2026-05-28T11:00:00Z', resolvedAt: '' },
  { id: 'TKT004', title: 'Glove stock depleted Ward B', category: 'Staffing/Supply', department: 'Nursing', priority: 'High', status: 'Open', reportedBy: 'Sister Prema Pillai', assignedTo: 'Procurement', description: 'Latex-free gloves out of stock in Ward B supply room.', resolution: '', createdAt: '2026-05-28T08:45:00Z', resolvedAt: '' },
  { id: 'TKT005', title: 'Lab drain blockage', category: 'Hygiene', department: 'Pathology', priority: 'Medium', status: 'Resolved', reportedBy: 'Dr. Rajesh Patel', assignedTo: 'Housekeeping', description: 'Floor drain in pathology lab is blocked, causing water pooling.', resolution: 'Drain cleared and disinfected by housekeeping at 16:00.', createdAt: '2026-05-26T10:00:00Z', resolvedAt: '2026-05-26T16:30:00Z' }
];

function renderDevicesTable() {
  const tbody = document.getElementById('admin-devices-table-body');
  if (!tbody) return;
  
  const devices = STATE.devices.length > 0 ? STATE.devices : SEED_DEVICES;
  const statDevices = document.getElementById('admin-stat-devices');
  if (statDevices) statDevices.textContent = devices.length;
  
  tbody.innerHTML = '';
  devices.forEach(dev => {
    const statusClass = dev.status === 'Active' ? 'status-done' : dev.status === 'Under Maintenance' ? 'status-active' : 'status-canceled';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="text-bold">${dev.name}</span><br><small class="text-muted">SN: ${dev.serialNumber}</small></td>
      <td>${dev.type}</td>
      <td>${dev.department} — ${dev.location}</td>
      <td><span class="status-indicator ${statusClass}">${dev.status}</span></td>
      <td>${dev.maintenanceDue}</td>
      <td><button class="glass-btn glass-btn-secondary" style="padding:3px 8px;font-size:.72rem" onclick="showToast('Device service log opened', 'info')">Details</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderComplaintsList() {
  const container = document.getElementById('admin-complaints-list');
  if (!container) return;
  
  const complaints = STATE.complaints.length > 0 ? STATE.complaints : SEED_COMPLAINTS;
  const statComplaints = document.getElementById('admin-stat-complaints');
  if (statComplaints) statComplaints.textContent = complaints.filter(c => c.status !== 'Resolved').length;
  
  container.innerHTML = '';
  complaints.forEach(c => {
    const priorityColor = c.priority === 'Critical' ? 'var(--danger)' : c.priority === 'High' ? 'var(--warning)' : c.priority === 'Medium' ? 'var(--info)' : 'var(--success)';
    const statusClass = c.status === 'Resolved' ? 'status-done' : c.status === 'In Progress' ? 'status-active' : 'status-canceled';
    const div = document.createElement('div');
    div.className = 'complaint-card';
    div.style.borderLeft = `3px solid ${priorityColor}`;
    div.style.cursor = 'pointer';
    div.onclick = () => openComplaintDetail(c.id);
    div.innerHTML = `
      <div class="flex-between" style="margin-bottom:4px">
        <span style="font-weight:600;font-size:.82rem">${c.title}</span>
        <span class="status-indicator ${statusClass}" style="font-size:.62rem">${c.status}</span>
      </div>
      <div style="font-size:.72rem;color:var(--text-2);margin-bottom:4px">${c.description}</div>
      <div style="display:flex;gap:12px;font-size:.68rem;color:var(--text-3)">
        <span>📍 ${c.department}</span>
        <span>⚡ ${c.priority}</span>
        <span>👤 ${c.reportedBy}</span>
        <span>🔧 ${c.assignedTo}</span>
      </div>
      ${c.resolution ? `<div style="font-size:.7rem;color:var(--success);margin-top:4px;font-style:italic">✓ ${c.resolution}</div>` : ''}
    `;
    container.appendChild(div);
  });
}

// ==========================================
// 21. BED MANAGEMENT GRID
// ==========================================

const BED_DATA = [
  { id: 'WA-01', ward: 'Ward A', status: 'available' },
  { id: 'WA-02', ward: 'Ward A', status: 'occupied', patient: 'AURA-2026-0001' },
  { id: 'WA-03', ward: 'Ward A', status: 'occupied', patient: 'AURA-2026-0003' },
  { id: 'WA-04', ward: 'Ward A', status: 'available' },
  { id: 'WA-05', ward: 'Ward A', status: 'cleaning' },
  { id: 'WA-06', ward: 'Ward A', status: 'available' },
  { id: 'WB-01', ward: 'Ward B', status: 'occupied', patient: 'AURA-2026-0002' },
  { id: 'WB-02', ward: 'Ward B', status: 'available' },
  { id: 'WB-03', ward: 'Ward B', status: 'available' },
  { id: 'WB-04', ward: 'Ward B', status: 'occupied', patient: 'AURA-2026-0005' },
  { id: 'ICU-01', ward: 'ICU', status: 'occupied', patient: 'AURA-2026-0004' },
  { id: 'ICU-02', ward: 'ICU', status: 'available' },
  { id: 'ICU-03', ward: 'ICU', status: 'cleaning' },
  { id: 'ICU-04', ward: 'ICU', status: 'available' }
];

function renderBedGrid() {
  const grid = document.getElementById('bed-management-grid');
  if (!grid) return;
  
  let filteredBeds = BED_DATA;
  if (STATE.currentUserProfile && STATE.currentUserProfile.role.toLowerCase().includes("nurs") && STATE.currentUserProfile.dept) {
    const dept = STATE.currentUserProfile.dept.toLowerCase();
    if (dept !== "nursing care" && dept !== "general" && dept !== "management") {
      filteredBeds = BED_DATA.filter(bed => {
        const ward = bed.ward.toLowerCase();
        return dept.includes(ward) || ward.includes(dept);
      });
    }
  }

  grid.innerHTML = filteredBeds.map(bed => {
    const colorMap = { available: 'var(--success-bg)', occupied: 'rgba(37,99,235,.08)', cleaning: 'var(--warning-bg)' };
    const borderMap = { available: 'var(--success)', occupied: 'var(--info)', cleaning: 'var(--warning)' };
    const patient = bed.patient ? STATE.patients.find(p => p.id === bed.patient) : null;
    return `
      <div class="bed-cell" style="background:${colorMap[bed.status]};border:1px solid ${borderMap[bed.status]};border-radius:6px;padding:6px 8px;text-align:center;cursor:pointer;min-width:60px" title="${bed.status}${patient ? ' — ' + patient.name : ''}">
        <div style="font-size:.72rem;font-weight:700;color:var(--text-1)">${bed.id}</div>
        <div style="font-size:.58rem;color:var(--text-2);text-transform:capitalize">${bed.status}</div>
        ${patient ? `<div style="font-size:.55rem;color:var(--primary);margin-top:1px">${patient.name.split(' ')[0]}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ==========================================
// 22. AI SYMPTOM TRIAGE
// ==========================================

window.runSymptomTriage = function() {
  const input = document.getElementById('symptom-triage-input');
  const result = document.getElementById('triage-result-panel');
  const symptoms = input.value.trim().toLowerCase();
  
  if (!symptoms) {
    showToast('Please enter symptoms to analyze.', 'error');
    return;
  }
  
  const urgent = ['chest pain', 'breathing', 'unconscious', 'seizure', 'stroke', 'heart', 'cardiac', 'hemorrhage', 'anaphylaxis'];
  const moderate = ['fever', 'vomiting', 'fracture', 'fall', 'dizziness', 'blood', 'infection', 'swelling'];
  
  let level, color, dept, desc;
  if (urgent.some(k => symptoms.includes(k))) {
    level = 'EMERGENCY — P1';
    color = 'var(--danger)';
    dept = 'Emergency / Cardiology';
    desc = 'Critical symptoms detected. Immediate attention required. Routing to ER triage.';
  } else if (moderate.some(k => symptoms.includes(k))) {
    level = 'URGENT — P2';
    color = 'var(--warning)';
    dept = 'General Medicine';
    desc = 'Moderate urgency. Patient should be seen within 30 minutes.';
  } else {
    level = 'ROUTINE — P3';
    color = 'var(--success)';
    dept = 'OPD General';
    desc = 'Non-urgent. Standard OPD consultation queue placement.';
  }
  
  result.innerHTML = `
    <div style="background:${color}10;border:1px solid ${color};border-radius:var(--radius-md);padding:12px;margin-top:10px">
      <div style="font-weight:700;color:${color};font-size:.85rem;margin-bottom:4px">${level}</div>
      <div style="font-size:.78rem;color:var(--text-1);margin-bottom:6px">${desc}</div>
      <div style="font-size:.72rem;color:var(--text-2)">Suggested Dept: <strong>${dept}</strong></div>
    </div>
  `;
  
  logAudit('Create', 'TRIAGE', `AI triage assessed: ${symptoms} → ${level}`);
};

// ==========================================
// 23. ADMIN DEVICE & COMPLAINT FORM HANDLERS
// ==========================================

// Add Device form toggle
try {
  document.getElementById('btn-add-device').addEventListener('click', () => {
    const form = document.getElementById('admin-device-create-form');
    if (form) {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      if (form.style.display === 'block') form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.getElementById('btn-confirm-add-device').addEventListener('click', () => {
    const name = document.getElementById('new-device-name').value.trim();
    const type = document.getElementById('new-device-type').value;
    const dept = document.getElementById('new-device-dept').value;
    const serial = document.getElementById('new-device-serial').value.trim();
    const location = document.getElementById('new-device-location').value.trim();
    const status = document.getElementById('new-device-status').value;
    
    if (!name) {
      showToast('Device name is required.', 'error');
      return;
    }
    
    const newDevice = {
      id: 'DEV' + String(Date.now()).slice(-6),
      name, type, department: dept, location: location || dept,
      status, serialNumber: serial || 'N/A',
      purchaseDate: new Date().toISOString().split('T')[0],
      maintenanceDue: '', lastMaintenance: '', warranty: '', notes: ''
    };
    
    convex.mutation(api.db.upsertDevice, newDevice)
      .then(() => {
        showToast(`Device "${name}" registered!`);
        logAudit('Create', newDevice.id, `New device registered: ${name} (${type})`);
      })
      .catch(err => showToast('Error: ' + err.message, 'error'));
    
    document.getElementById('admin-device-create-form').style.display = 'none';
    document.getElementById('new-device-name').value = '';
    document.getElementById('new-device-serial').value = '';
    document.getElementById('new-device-location').value = '';
  });

  // Add Complaint form toggle
  document.getElementById('btn-add-complaint').addEventListener('click', () => {
    const form = document.getElementById('admin-complaint-create-form');
    if (form) {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      if (form.style.display === 'block') form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.getElementById('btn-confirm-add-complaint').addEventListener('click', () => {
    const title = document.getElementById('new-complaint-title').value.trim();
    const category = document.getElementById('new-complaint-category').value;
    const dept = document.getElementById('new-complaint-dept').value;
    const priority = document.getElementById('new-complaint-priority').value;
    const assignTo = document.getElementById('new-complaint-assign').value.trim();
    const desc = document.getElementById('new-complaint-desc').value.trim();
    
    if (!title) {
      showToast('Ticket title is required.', 'error');
      return;
    }
    
    const newTicket = {
      id: 'TKT' + String(Date.now()).slice(-6),
      title, category, department: dept, priority, status: 'Open',
      reportedBy: 'Dr. Vikram Aditya', assignedTo: assignTo || 'Unassigned',
      description: desc || title, resolution: '',
      createdAt: new Date().toISOString(), resolvedAt: ''
    };
    
    convex.mutation(api.db.upsertComplaint, newTicket)
      .then(() => {
        showToast(`Ticket "${title}" created!`);
        logAudit('Create', newTicket.id, `New complaint ticket: ${title}`);
      })
      .catch(err => showToast('Error: ' + err.message, 'error'));
    
    document.getElementById('admin-complaint-create-form').style.display = 'none';
    document.getElementById('new-complaint-title').value = '';
    document.getElementById('new-complaint-desc').value = '';
    document.getElementById('new-complaint-assign').value = '';
  });
} catch(e) { console.warn('Form handler init error:', e); }

// ==========================================
// 24. PASSWORD RESET (Super Admin)
// ==========================================

window.resetStaffPassword = function(staffId) {
  const staff = STAFF_ACCOUNTS.find(s => s.id === staffId);
  if (!staff) return;
  const tempPass = 'Temp' + Math.random().toString(36).slice(2, 8);
  showToast(`Password reset for ${staff.name}. Temporary: ${tempPass}`, 'info');
  logAudit('Edit', staffId, `Password reset issued for: ${staff.name}`);
};

// ==========================================
// 25. ENHANCED ADMIN loadDashboardData
// ==========================================

// Enhanced loadDashboardData — includes all admin sections + bed grid
const _originalLoadDashboard = loadDashboardData;
loadDashboardData = function() {
  _originalLoadDashboard();
  if (STATE.activeRole === 'admin') {
    renderDeptCards();
    renderDevicesTable();
    renderComplaintsList();
  }
  if (STATE.activeRole === 'nursing') {
    renderBedGrid();
  }
};

// Enhanced showStatDetail — handles devices & complaints
const _originalShowStatDetail = window.showStatDetail;
window.showStatDetail = function(type) {
  if (type === 'devices') {
    const panel = document.getElementById('admin-stat-detail-panel');
    const titleEl = document.getElementById('stat-detail-title');
    const content = document.getElementById('stat-detail-content');
    titleEl.textContent = 'Equipment Inventory';
    const devices = STATE.devices.length > 0 ? STATE.devices : SEED_DEVICES;
    const byDept = {};
    devices.forEach(d => { byDept[d.department] = (byDept[d.department] || 0) + 1; });
    const active = devices.filter(d => d.status === 'Active').length;
    const maintenance = devices.filter(d => d.status === 'Under Maintenance').length;
    content.innerHTML = `
      <div style="display:flex;gap:20px;margin-bottom:12px">
        <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--success);font-family:Space Grotesk">${active}</div><div style="font-size:.72rem;color:var(--text-2)">Active</div></div>
        <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--warning);font-family:Space Grotesk">${maintenance}</div><div style="font-size:.72rem;color:var(--text-2)">Maintenance</div></div>
        <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--primary);font-family:Space Grotesk">${devices.length}</div><div style="font-size:.72rem;color:var(--text-2)">Total</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
        ${Object.entries(byDept).map(([dept, count]) => `<div style="background:var(--bg);padding:8px;border-radius:6px;text-align:center"><div style="font-size:1.1rem;font-weight:700;color:var(--primary)">${count}</div><div style="font-size:.68rem;color:var(--text-2)">${dept}</div></div>`).join('')}
      </div>
    `;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (type === 'complaints') {
    const panel = document.getElementById('admin-stat-detail-panel');
    const titleEl = document.getElementById('stat-detail-title');
    const content = document.getElementById('stat-detail-content');
    titleEl.textContent = 'Complaint Summary';
    const complaints = STATE.complaints.length > 0 ? STATE.complaints : SEED_COMPLAINTS;
    const open = complaints.filter(c => c.status === 'Open').length;
    const inProgress = complaints.filter(c => c.status === 'In Progress').length;
    const resolved = complaints.filter(c => c.status === 'Resolved').length;
    content.innerHTML = `
      <div style="display:flex;gap:20px;margin-bottom:12px">
        <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--danger);font-family:Space Grotesk">${open}</div><div style="font-size:.72rem;color:var(--text-2)">Open</div></div>
        <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--warning);font-family:Space Grotesk">${inProgress}</div><div style="font-size:.72rem;color:var(--text-2)">In Progress</div></div>
        <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--success);font-family:Space Grotesk">${resolved}</div><div style="font-size:.72rem;color:var(--text-2)">Resolved</div></div>
      </div>
      <div style="font-size:.78rem;color:var(--text-2)">Total tickets: ${complaints.length}. Critical: ${complaints.filter(c => c.priority === 'Critical').length}.</div>
    `;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    _originalShowStatDetail(type);
  }
};

// ==========================================
// 26. SYSTEM SETTINGS NAVIGATION
// ==========================================

window.navigateToSettings = function() {
  document.querySelectorAll('.role-panel').forEach(p => p.style.display = 'none');
  document.getElementById('page-system-settings').style.display = 'block';
  document.getElementById('current-panel-title').textContent = 'System Settings';
  document.getElementById('current-panel-subtitle').textContent = 'Configure hospital-wide settings, security policies, and module access.';
  logAudit('View', 'SYS', 'Opened System Settings');
};

window.navigateBackFromSettings = function() {
  document.getElementById('page-system-settings').style.display = 'none';
  switchRole(STATE.activeRole);
};

window.togglePassphraseVisibility = function() {
  const input = document.getElementById('sys-crypto-passphrase');
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
};

// ==========================================
// 27. INVESTIGATION RESULT ROUTING
// ==========================================

function routePatientBackIfAllDone(patientId) {
  // Check all pending investigations for this patient
  const allInvForPatient = STATE.investigations.filter(i => 
    i.patientId === patientId && (i.type === 'Lab' || i.type === 'Radiology')
  );
  const pending = allInvForPatient.filter(i => i.status === 'Pending');
  
  if (pending.length === 0 && allInvForPatient.length > 0) {
    // All investigations are done — route patient back to nurse queue
    const apt = STATE.appointments.find(a => a.patientId === patientId && a.status === 'Sent for Tests');
    if (apt) {
      apt.status = 'Results Ready';
      apt.investigationStatus = 'Results Ready';
      apt.department = apt.department || 'General Medicine';
      convex.mutation(api.db.upsertAppointment, apt)
        .then(() => {
          showToast(`All results ready for patient ${patientId}. Routed to nurse queue.`, 'info');
          logAudit('Edit', apt.id, `Patient ${patientId} investigation results complete — routed back to nurse queue`);
        })
        .catch(err => console.error('Route-back failed:', err));
    }
  }
}

// Nurse sends returning patient to doctor
function sendResultsPatientToDoctor(aptId, patientId) {
  const apt = STATE.appointments.find(a => a.id === aptId);
  if (!apt) return;
  
  apt.status = 'In Consultation';
  apt.department = apt.department || 'General Medicine';
  convex.mutation(api.db.upsertAppointment, apt)
    .then(() => {
      showToast('Patient sent back to doctor with investigation results.');
      logAudit('Edit', aptId, `Nurse dispatched returning patient ${patientId} to doctor`);
      renderNursingQueue();
    })
    .catch(err => {
      console.error(err);
      showToast('Failed to route patient: ' + err.message, 'error');
    });
}

// ==========================================
// 28. INVESTIGATION CHIP CLICK HANDLERS
// ==========================================

function initInvestigationChips() {
  document.querySelectorAll('.investigation-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      // Show/hide the Refer for Tests button
      const anySelected = document.querySelectorAll('.investigation-chip.selected').length > 0;
      const referBtn = document.getElementById('btn-doc-refer-tests');
      if (referBtn) referBtn.style.display = anySelected ? 'inline-flex' : 'none';
    });
  });
}

// ==========================================
// 29. DEPARTMENT OVERVIEW GLASS MODAL
// ==========================================

window.showDeptDetail = function(deptName) {
  openDepartmentOverview(deptName);
};

function openDepartmentOverview(deptName) {
  const modal = document.getElementById('modal-dept-overview');
  const title = document.getElementById('dept-overview-title');
  const body = document.getElementById('dept-overview-body');
  
  title.textContent = deptName;
  
  // Aggregate data for this department
  const deptDoctors = DOCTORS.filter(d => d.dept === deptName);
  const deptStaff = STAFF_ACCOUNTS.filter(s => {
    const deptKey = deptName.toLowerCase().split(' ')[0];
    return s.dept.toLowerCase().includes(deptKey);
  });
  const deptDevices = (STATE.devices.length > 0 ? STATE.devices : SEED_DEVICES)
    .filter(d => d.department === deptName || d.department.toLowerCase().includes(deptName.toLowerCase().split(' ')[0]));
  const deptAppointments = STATE.appointments.filter(a => {
    const doc = DOCTORS.find(d => d.id === a.doctorId);
    return (a.department === deptName) || (doc && doc.dept === deptName);
  });
  const activePatients = deptAppointments.filter(a => a.status !== 'Done').length;
  
  body.innerHTML = `
    <div class="overview-stat-grid">
      <div class="overview-stat-item"><div class="overview-stat-value">${deptDoctors.length}</div><div class="overview-stat-label">Doctors</div></div>
      <div class="overview-stat-item"><div class="overview-stat-value">${deptStaff.length}</div><div class="overview-stat-label">Staff</div></div>
      <div class="overview-stat-item"><div class="overview-stat-value">${deptDevices.length}</div><div class="overview-stat-label">Equipment</div></div>
      <div class="overview-stat-item"><div class="overview-stat-value">${activePatients}</div><div class="overview-stat-label">Active Patients</div></div>
    </div>
    
    <div class="overview-section">
      <div class="overview-section-title">Doctors & Consultants</div>
      <div class="overview-staff-grid">
        ${deptDoctors.length > 0 ? deptDoctors.map(d => `
          <div class="overview-staff-card">
            <div class="overview-staff-avatar">${d.name.split(' ').map(n => n[0]).join('').slice(0,2)}</div>
            <div><div class="overview-staff-name">${d.name}</div><div class="overview-staff-role">${d.spec} · ${d.id}</div></div>
          </div>
        `).join('') : '<div style="font-size:.78rem;color:var(--text-3);padding:8px">No doctors assigned</div>'}
      </div>
    </div>
    
    <div class="overview-section">
      <div class="overview-section-title">Staff Members</div>
      <div class="overview-staff-grid">
        ${deptStaff.map(s => `
          <div class="overview-staff-card">
            <div class="overview-staff-avatar" style="background:linear-gradient(135deg,#059669,#10b981)">${s.name.split(' ').map(n => n[0]).join('').slice(0,2)}</div>
            <div><div class="overview-staff-name">${s.name}</div><div class="overview-staff-role">${s.role} · ${s.status}</div></div>
          </div>
        `).join('') || '<div style="font-size:.78rem;color:var(--text-3);padding:8px">No staff assigned</div>'}
      </div>
    </div>
    
    <div class="overview-section">
      <div class="overview-section-title">Equipment & Devices</div>
      <div class="overview-equip-list">
        ${deptDevices.length > 0 ? deptDevices.map(d => {
          const statusColor = d.status === 'Active' ? 'var(--success)' : d.status === 'Under Maintenance' ? 'var(--warning)' : 'var(--danger)';
          return `<div class="overview-equip-item"><span style="color:${statusColor};font-size:.9rem">●</span><span>${d.name}</span><span class="text-muted">${d.type}</span></div>`;
        }).join('') : '<div style="font-size:.78rem;color:var(--text-3);padding:8px">No equipment assigned</div>'}
      </div>
    </div>
    
    <div class="overview-section">
      <div class="overview-section-title">Today's Queue</div>
      ${deptAppointments.length > 0 ? `
        <table class="ehr-table" style="font-size:.75rem">
          <thead><tr><th>Token</th><th>Patient</th><th>Status</th></tr></thead>
          <tbody>
            ${deptAppointments.map(a => {
              const p = STATE.patients.find(pt => pt.id === a.patientId);
              const statusClass = a.status === 'Done' ? 'status-done' : a.status === 'In Consultation' ? 'status-active' : 'status-booked';
              return `<tr><td>#${a.token}</td><td>${p ? p.name : a.patientId}</td><td><span class="status-indicator ${statusClass}">${a.status}</span></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : '<div style="font-size:.78rem;color:var(--text-3);padding:8px;text-align:center">No appointments today</div>'}
    </div>
  `;
  
  modal.classList.add('open');
  logAudit('View', 'DEPT', `Opened department overview: ${deptName}`);
}

window.closeDeptOverview = function() {
  document.getElementById('modal-dept-overview').classList.remove('open');
};

// ==========================================
// 30. STAFF CONFIGURE GLASS MODAL
// ==========================================

window.openStaffConfigure = function(staffId) {
  const staff = STAFF_ACCOUNTS.find(s => s.id === staffId);
  if (!staff) return;
  
  const modal = document.getElementById('modal-staff-configure');
  document.getElementById('staff-config-title').textContent = `Configure: ${staff.name}`;
  
  const body = document.getElementById('staff-config-body');
  const currentShift = staff.shift || 'Morning';
  const currentDays = staff.workDays || 'Mon,Tue,Wed,Thu,Fri';
  const daysArr = currentDays.split(',');
  const allDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  
  body.innerHTML = `
    <div class="staff-config-section">
      <h4>Shift Assignment</h4>
      <div class="shift-picker">
        ${['Morning','Evening','Night','Rotational'].map(s => `
          <div class="shift-option ${currentShift === s ? 'selected' : ''}" data-shift="${s}" onclick="selectShift(this, '${s}')">${s}</div>
        `).join('')}
      </div>
    </div>
    
    <div class="staff-config-section">
      <h4>Work Days</h4>
      <div class="day-picker">
        ${allDays.map(d => `
          <div class="day-chip ${daysArr.includes(d) ? 'selected' : ''}" data-day="${d}" onclick="toggleDay(this)">${d.slice(0,2)}</div>
        `).join('')}
      </div>
    </div>
    
    <div class="staff-config-section">
      <h4>Leave Management</h4>
      <div class="grid-2">
        <div class="form-group"><label>Leave Balance (Days)</label><input type="number" id="cfg-leave-balance" value="${staff.leaveBalance || 18}"></div>
        <div class="form-group"><label>Leave Type</label><select><option>Casual Leave</option><option>Sick Leave</option><option>Privilege Leave</option><option>Compensatory Off</option></select></div>
      </div>
    </div>
    
    <div class="staff-config-section">
      <h4>Qualifications & Contact</h4>
      <div class="grid-2">
        <div class="form-group"><label>Qualification</label><input type="text" id="cfg-qualification" value="${staff.qualification || 'MBBS'}" placeholder="MBBS, MD, etc."></div>
        <div class="form-group"><label>Specialization</label><input type="text" id="cfg-specialization" value="${staff.specialization || ''}" placeholder="e.g. Internal Medicine"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>Phone</label><input type="tel" id="cfg-phone" value="${staff.phone || ''}" placeholder="+91 98765 43210"></div>
        <div class="form-group"><label>Email</label><input type="email" id="cfg-email" value="${staff.email || ''}" placeholder="name@hospital.in"></div>
      </div>
    </div>
    
    <div class="staff-config-section">
      <h4>Security</h4>
      <button class="glass-btn glass-btn-danger" style="width:100%;margin-bottom:8px" onclick="resetStaffPassword('${staffId}')">🔒 Reset Password</button>
    </div>
    
    <div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:12px">
      <button class="glass-btn glass-btn-secondary" onclick="closeStaffConfigure()">Cancel</button>
      <button class="glass-btn glass-btn-primary" onclick="saveStaffConfig('${staffId}')">Save Changes</button>
    </div>
  `;
  
  modal.classList.add('open');
};

window.selectShift = function(el, shift) {
  document.querySelectorAll('.shift-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
};

window.toggleDay = function(el) {
  el.classList.toggle('selected');
};

window.saveStaffConfig = function(staffId) {
  const staff = STAFF_ACCOUNTS.find(s => s.id === staffId);
  if (!staff) return;
  
  const selectedShift = document.querySelector('.shift-option.selected');
  const selectedDays = Array.from(document.querySelectorAll('.day-chip.selected')).map(d => d.dataset.day);
  
  const updateData = {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    dept: staff.dept,
    license: staff.license,
    status: staff.status,
    shift: selectedShift ? selectedShift.dataset.shift : 'Morning',
    workDays: selectedDays.join(','),
    leaveBalance: parseInt(document.getElementById('cfg-leave-balance').value) || 18,
    qualification: document.getElementById('cfg-qualification').value,
    specialization: document.getElementById('cfg-specialization').value,
    phone: document.getElementById('cfg-phone').value,
    email: document.getElementById('cfg-email').value
  };
  
  convex.mutation(api.db.upsertStaffAccount, updateData)
    .then(() => {
      showToast(`Staff profile updated for ${staff.name}`);
      logAudit('Edit', staffId, `Updated staff configuration: shift=${updateData.shift}, days=${updateData.workDays}`);
      closeStaffConfigure();
    })
    .catch(err => showToast('Error: ' + err.message, 'error'));
};

window.closeStaffConfigure = function() {
  document.getElementById('modal-staff-configure').classList.remove('open');
};

// ==========================================
// 31. COMPLAINT DETAIL GLASS MODAL
// ==========================================

window.openComplaintDetail = function(complaintId) {
  const complaints = STATE.complaints.length > 0 ? STATE.complaints : SEED_COMPLAINTS;
  const complaint = complaints.find(c => c.id === complaintId);
  if (!complaint) return;
  
  const modal = document.getElementById('modal-complaint-detail');
  document.getElementById('complaint-detail-title').textContent = `Ticket: ${complaint.id}`;
  
  const body = document.getElementById('complaint-detail-body');
  const priorityColors = { Critical: 'var(--danger)', High: 'var(--warning)', Medium: 'var(--info)', Low: 'var(--success)' };
  const comments = complaint.comments || [];
  
  body.innerHTML = `
    <div style="margin-bottom:14px">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:4px">${complaint.title}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <span class="status-indicator" style="background:${priorityColors[complaint.priority]}20;color:${priorityColors[complaint.priority]};border-color:${priorityColors[complaint.priority]}">${complaint.priority}</span>
        <span class="status-indicator ${complaint.status === 'Resolved' ? 'status-done' : complaint.status === 'In Progress' ? 'status-active' : 'status-canceled'}">${complaint.status}</span>
        <span class="insurance-badge">${complaint.category}</span>
      </div>
      <div style="font-size:.78rem;color:var(--text-1);margin-bottom:8px">${complaint.description}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.72rem;color:var(--text-2)">
        <div><strong>Department:</strong> ${complaint.department}</div>
        <div><strong>Reported By:</strong> ${complaint.reportedBy}</div>
        <div><strong>Assigned To:</strong> ${complaint.assignedTo}</div>
        <div><strong>Created:</strong> ${new Date(complaint.createdAt).toLocaleDateString()}</div>
      </div>
      ${complaint.resolution ? `<div style="margin-top:8px;padding:8px;background:var(--success-bg);border-radius:var(--radius-sm);font-size:.75rem;color:var(--success)"><strong>Resolution:</strong> ${complaint.resolution}</div>` : ''}
    </div>
    
    <div style="border-top:1px solid var(--border);padding-top:12px">
      <div style="font-size:.75rem;font-weight:700;color:var(--text-2);text-transform:uppercase;margin-bottom:8px">Activity Timeline</div>
      <div class="complaint-timeline">
        <div class="complaint-comment">
          <div><span class="complaint-comment-author">${complaint.reportedBy}</span><span class="complaint-comment-time">${new Date(complaint.createdAt).toLocaleString()}</span></div>
          <div class="complaint-comment-text">Created ticket: ${complaint.title}</div>
        </div>
        ${comments.map(c => `
          <div class="complaint-comment">
            <div><span class="complaint-comment-author">${c.author}</span><span class="complaint-comment-time">${new Date(c.timestamp).toLocaleString()}</span></div>
            <div class="complaint-comment-text">${c.text}</div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">
      <div class="form-group" style="margin-bottom:8px"><label>Add Comment</label><textarea id="complaint-new-comment" placeholder="Type your comment..."></textarea></div>
      <div style="display:flex;gap:8px;justify-content:space-between">
        <div style="display:flex;gap:6px">
          ${complaint.status !== 'Resolved' 
            ? `<button class="glass-btn glass-btn-success" onclick="resolveComplaint('${complaintId}')">✓ Mark Resolved</button>`
            : `<button class="glass-btn glass-btn-danger" onclick="reopenComplaint('${complaintId}')">↻ Reopen</button>`
          }
        </div>
        <button class="glass-btn glass-btn-primary" onclick="addComplaintComment('${complaintId}')">Post Comment</button>
      </div>
    </div>
  `;
  
  modal.classList.add('open');
  logAudit('View', complaintId, `Opened complaint ticket detail`);
};

window.addComplaintComment = function(complaintId) {
  const text = document.getElementById('complaint-new-comment').value.trim();
  if (!text) { showToast('Please enter a comment.', 'error'); return; }
  
  const complaints = STATE.complaints.length > 0 ? STATE.complaints : SEED_COMPLAINTS;
  const complaint = complaints.find(c => c.id === complaintId);
  if (!complaint) return;
  
  const newComment = { author: 'Dr. Vikram Aditya', text, timestamp: new Date().toISOString() };
  const comments = complaint.comments || [];
  comments.push(newComment);
  complaint.comments = comments;
  
  convex.mutation(api.db.upsertComplaint, complaint)
    .then(() => {
      showToast('Comment posted.');
      openComplaintDetail(complaintId); // Re-render
    })
    .catch(err => showToast('Error: ' + err.message, 'error'));
};

window.resolveComplaint = function(complaintId) {
  const complaints = STATE.complaints.length > 0 ? STATE.complaints : SEED_COMPLAINTS;
  const complaint = complaints.find(c => c.id === complaintId);
  if (!complaint) return;
  
  complaint.status = 'Resolved';
  complaint.resolvedAt = new Date().toISOString();
  complaint.resolution = document.getElementById('complaint-new-comment').value.trim() || 'Resolved by admin.';
  
  convex.mutation(api.db.upsertComplaint, complaint)
    .then(() => {
      showToast('Ticket resolved.');
      logAudit('Edit', complaintId, `Resolved complaint ticket`);
      closeComplaintDetail();
      renderComplaintsList();
    })
    .catch(err => showToast('Error: ' + err.message, 'error'));
};

window.reopenComplaint = function(complaintId) {
  const complaints = STATE.complaints.length > 0 ? STATE.complaints : SEED_COMPLAINTS;
  const complaint = complaints.find(c => c.id === complaintId);
  if (!complaint) return;
  
  complaint.status = 'Open';
  complaint.resolvedAt = '';
  complaint.resolution = '';
  
  convex.mutation(api.db.upsertComplaint, complaint)
    .then(() => {
      showToast('Ticket reopened.');
      closeComplaintDetail();
      renderComplaintsList();
    })
    .catch(err => showToast('Error: ' + err.message, 'error'));
};

window.closeComplaintDetail = function() {
  document.getElementById('modal-complaint-detail').classList.remove('open');
};

// ==========================================
// 32. SYSTEM BOOT
// ==========================================

window.addEventListener('DOMContentLoaded', async () => {
  await initPiiCrypto();
  initLogin();
  
  // Register Auth Listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      STATE.isAuthenticated = true;
      
      try {
        const q = query(collection(db, "staffAccounts"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const staffDoc = querySnapshot.docs[0].data();
          STATE.currentUserProfile = staffDoc;
          
          let targetRole = staffDoc.role.toLowerCase();
          if (targetRole.includes("admin")) {
            STATE.activeRole = "admin";
          } else if (targetRole.includes("reception")) {
            STATE.activeRole = "reception";
          } else if (targetRole.includes("nurse") || targetRole.includes("nursing")) {
            STATE.activeRole = "nursing";
          } else if (targetRole.includes("doctor")) {
            STATE.activeRole = "doctor";
          } else if (targetRole.includes("lab") || targetRole.includes("pathology")) {
            STATE.activeRole = "lab";
          } else if (targetRole.includes("radio") || targetRole.includes("image")) {
            STATE.activeRole = "radiology";
          } else if (targetRole.includes("pharmac")) {
            STATE.activeRole = "pharmacy";
          } else if (targetRole.includes("finance") || targetRole.includes("bill")) {
            STATE.activeRole = "finance";
          } else {
            STATE.activeRole = "patient";
          }
          STATE.activePanel = ROLE_NAV_CONFIGS[STATE.activeRole][0].id;
        } else {
          // Fallback if not found in staffAccounts (e.g. if we created an auth user but no database document yet)
          console.warn("No staff account record found in Firestore for email:", user.email);
          STATE.currentUserProfile = { name: user.email, role: 'Super Admin', email: user.email, dept: 'Management' };
          STATE.activeRole = "admin";
          STATE.activePanel = "admin";
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
        STATE.currentUserProfile = { name: user.email, role: 'Super Admin', email: user.email, dept: 'Management' };
        STATE.activeRole = "admin";
        STATE.activePanel = "admin";
      }

      // Update Topnav profile UI
      const nameEl = document.getElementById('user-display-name');
      const roleEl = document.getElementById('user-role-display');
      const avatarEl = document.getElementById('user-avatar-initials');
      const selectEl = document.getElementById('global-role-select');
      const selectContainer = document.querySelector('.role-picker-container');
      
      if (nameEl) nameEl.textContent = STATE.currentUserProfile.name;
      if (roleEl) roleEl.textContent = `${STATE.currentUserProfile.role} (${STATE.currentUserProfile.dept || 'No Dept'})`;
      if (avatarEl) {
        const initials = STATE.currentUserProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        avatarEl.textContent = initials;
      }
      if (selectEl) selectEl.value = STATE.activeRole;
      
      // Restrict role select dropdown to Super Admins only
      if (selectContainer) {
        if (STATE.currentUserProfile.role === 'Super Admin') {
          selectContainer.style.display = 'block';
        } else {
          selectContainer.style.display = 'none';
        }
      }

      // Hide login, show main workspace
      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('topnav').style.display = 'flex';
      document.getElementById('main-content').style.display = 'block';

      // Load Firestore real-time subscriptions, routing, search & chips
      loadFromStorage();
      initRouter();
      initGlobalSearch();
      initInvestigationChips();

      logAudit('View', 'SYS', `Staff ${user.email} signed in successfully`);
      showToast(`Welcome back, ${STATE.currentUserProfile.name}!`);
    } else {
      STATE.isAuthenticated = false;
      STATE.currentUserProfile = null;
      document.getElementById('login-overlay').style.display = 'flex';
      document.getElementById('topnav').style.display = 'none';
      document.getElementById('main-content').style.display = 'none';
    }
  });
});

