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
    getEmergencyCases: "emergencyCases",
    getIcuAdmissions: "icuAdmissions",
    getIcuCharting: "icuCharting",
    getSurgeries: "surgeries",
    getOtSchedule: "otSchedule",
    getBloodInventory: "bloodInventory",
    getBloodRequests: "bloodRequests",
    getDonors: "donors",
    getDietOrders: "dietOrders",
    getAmbulanceTrips: "ambulanceTrips",
    getAmbulanceFleet: "ambulanceFleet",
    getDischargeSummaries: "dischargeSummaries",
    getMessages: "messages",
    getPharmacyInventory: "pharmacyInventory",
    getLabReagents: "labReagents",
    getSystemSettings: "systemSettings",
    
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
    upsertNotification: "notifications",
    upsertEmergencyCase: "emergencyCases",
    upsertIcuAdmission: "icuAdmissions",
    upsertIcuCharting: "icuCharting",
    upsertSurgery: "surgeries",
    upsertOtSchedule: "otSchedule",
    upsertBloodInventory: "bloodInventory",
    upsertBloodRequest: "bloodRequests",
    upsertDonor: "donors",
    upsertDietOrder: "dietOrders",
    upsertAmbulanceTrip: "ambulanceTrips",
    upsertAmbulanceFleet: "ambulanceFleet",
    upsertDischargeSummary: "dischargeSummaries",
    upsertMessage: "messages",
    upsertPharmacyInventory: "pharmacyInventory",
    upsertLabReagent: "labReagents",
    upsertSystemSettings: "systemSettings"
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
    abhaId: p.abhaId ? await encryptText(p.abhaId) : "",
    address: p.address ? await encryptText(p.address) : "",
    occupation: p.occupation ? await encryptText(p.occupation) : "",
    maritalStatus: p.maritalStatus ? await encryptText(p.maritalStatus) : "",
    allergies: p.allergies ? await encryptText(p.allergies) : "",
    chronicConditions: p.chronicConditions ? await encryptText(p.chronicConditions) : "",
    referredBy: p.referredBy ? await encryptText(p.referredBy) : ""
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
    status: patient.status,
    photo: patient.photo || "",
    address: patient.address || "",
    occupation: patient.occupation || "",
    maritalStatus: patient.maritalStatus || "",
    allergies: patient.allergies || "",
    chronicConditions: patient.chronicConditions || "",
    referredBy: patient.referredBy || ""
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
  notifications: [],
  emergencyCases: [],
  icuAdmissions: [],
  icuCharting: [],
  surgeries: [],
  otSchedule: [],
  bloodInventory: [],
  bloodRequests: [],
  donors: [],
  dietOrders: [],
  ambulanceTrips: [],
  ambulanceFleet: [],
  dischargeSummaries: [],
  messages: [],
  pharmacyInventory: [],
  labReagents: [],
  systemSettings: null
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
      { email: "finance@atralos.com", pass: "Pass123" },
      { email: "emergency@atralos.com", pass: "Pass123" },
      { email: "icu@atralos.com", pass: "Pass123" },
      { email: "ot@atralos.com", pass: "Pass123" },
      { email: "bloodbank@atralos.com", pass: "Pass123" },
      { email: "diet@atralos.com", pass: "Pass123" },
      { email: "transport@atralos.com", pass: "Pass123" }
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

    // Seed staffAccounts for the new roles
    const newStaffRecords = [
      { id: "STF_ER_01", name: "Dr. Tarun Verma", role: "Emergency Doctor", dept: "Emergency / Trauma", email: "emergency@atralos.com" },
      { id: "STF_ICU_01", name: "Dr. Ritu Choudhury", role: "ICU Specialist", dept: "ICU Management", email: "icu@atralos.com" },
      { id: "STF_OT_01", name: "Dr. Sandeep Sen", role: "Chief Surgeon", dept: "Operation Theatre", email: "ot@atralos.com" },
      { id: "STF_BB_01", name: "Dr. Alok Malhotra", role: "Blood Bank Officer", dept: "Blood Bank", email: "bloodbank@atralos.com" },
      { id: "STF_DT_01", name: "Dr. Nidhi Joshi", role: "Dietitian", dept: "Diet & Nutrition", email: "diet@atralos.com" },
      { id: "STF_TR_01", name: "Suresh Gowda", role: "Ambulance Driver", dept: "Ambulance & Transport", email: "transport@atralos.com" }
    ];

    for (const st of newStaffRecords) {
      await setDoc(doc(db, "staffAccounts", st.id), {
        ...st,
        status: "Active",
        shift: "Morning",
        workDays: "Mon,Tue,Wed,Thu,Fri",
        qualification: "MD/Diploma",
        specialization: st.dept,
        phone: "9876543210",
        leaveBalance: 15,
        joiningDate: new Date().toISOString().split('T')[0]
      });
    }    // Seed systemSettings
    const defaultSettings = {
      id: 'system-settings',
      hospitalName: 'Auratral General Hospital',
      helpline: '+91 80 1234 5678',
      policy2fa: true,
      sessionTimeout: '30 min',
      passwordPolicy: 'Strong',
      ipWhitelisting: false,
      modulePharmacy: true,
      moduleRadiology: true,
      moduleLab: true,
      modulePatientPortal: true,
      moduleAiTriage: true,
      policyRetention: '7'
    };
    await setDoc(doc(db, "systemSettings", defaultSettings.id), defaultSettings);

    // 1. Patients (10 records)
    const seedPatients = [
      { id: 'AURA-2026-0001', name: 'Rajesh Kumar', dob: '1984-06-15', gender: 'Male', mobile: '9876543210', bloodGroup: 'O+', emergency: 'Sunita Kumar - 9876543211', insurance: 'Star Health - POL100329', abhaId: 'rajesh.kumar@abdm', consentAcademic: true, consentCommercial: true, consentFuture: true, regDate: '2026-05-27T10:00:00Z', status: 'OPD Queue', photo: '', address: 'MG Road, Bengaluru', occupation: 'Engineer', maritalStatus: 'Married', allergies: 'Penicillin', chronicConditions: 'Diabetes', referredBy: 'Self' },
      { id: 'AURA-2026-0002', name: 'Priyanka Sen', dob: '1992-11-20', gender: 'Female', mobile: '9123456789', bloodGroup: 'B+', emergency: 'Deepak Sen - 9123456780', insurance: 'HDFC Ergo - POL903214', abhaId: 'priyanka@abdm', consentAcademic: true, consentCommercial: false, consentFuture: true, regDate: '2026-05-27T11:00:00Z', status: 'In Consultation', photo: '', address: 'Indiranagar, Bengaluru', occupation: 'Teacher', maritalStatus: 'Married', allergies: 'Dust', chronicConditions: 'Asthma', referredBy: 'Dr. Sen' },
      { id: 'AURA-2026-0003', name: 'Harish Mehta', dob: '1959-03-08', gender: 'Male', mobile: '9001122334', bloodGroup: 'A-', emergency: 'Alka Mehta - 9001122335', insurance: 'N/A', abhaId: '', consentAcademic: false, consentCommercial: false, consentFuture: false, regDate: '2026-05-27T12:00:00Z', status: 'Booked', photo: '', address: 'Koramangala, Bengaluru', occupation: 'Retired', maritalStatus: 'Married', allergies: 'None', chronicConditions: 'Hypertension', referredBy: 'Self' },
      { id: 'AURA-2026-0004', name: 'Kavita Reddy', dob: '1975-08-22', gender: 'Female', mobile: '9988776655', bloodGroup: 'AB+', emergency: 'Sanjay Reddy - 9988776654', insurance: 'Star Health - POL100984', abhaId: 'kavita@abdm', consentAcademic: true, consentCommercial: true, consentFuture: true, regDate: '2026-05-27T13:00:00Z', status: 'Admitted', photo: '', address: 'Whitefield, Bengaluru', occupation: 'Manager', maritalStatus: 'Married', allergies: 'Peanuts', chronicConditions: 'None', referredBy: 'Self' },
      { id: 'AURA-2026-0005', name: 'Amit Sharma', dob: '1988-02-14', gender: 'Male', mobile: '9880011223', bloodGroup: 'O-', emergency: 'Rita Sharma - 9880011224', insurance: 'ICICI Lombard - POL44392', abhaId: 'amit@abdm', consentAcademic: false, consentCommercial: false, consentFuture: true, regDate: '2026-05-27T14:00:00Z', status: 'Discharged', photo: '', address: 'Jayanagar, Bengaluru', occupation: 'Developer', maritalStatus: 'Single', allergies: 'None', chronicConditions: 'None', referredBy: 'Dr. Verma' },
      { id: 'AURA-2026-0006', name: 'Saira Banu', dob: '1995-12-05', gender: 'Female', mobile: '9770022334', bloodGroup: 'A+', emergency: 'Yusuf Khan - 9770022335', insurance: 'Care Health - POL88921', abhaId: 'saira@abdm', consentAcademic: true, consentCommercial: false, consentFuture: true, regDate: '2026-05-27T15:00:00Z', status: 'Booked', photo: '', address: 'Frazer Town, Bengaluru', occupation: 'Writer', maritalStatus: 'Single', allergies: 'None', chronicConditions: 'Migraine', referredBy: 'Self' },
      { id: 'AURA-2026-0007', name: 'Vikram Singh', dob: '1970-07-30', gender: 'Male', mobile: '9660033445', bloodGroup: 'B-', emergency: 'Karan Singh - 9660033446', insurance: 'N/A', abhaId: '', consentAcademic: false, consentCommercial: false, consentFuture: false, regDate: '2026-05-27T16:00:00Z', status: 'Booked', photo: '', address: 'Hebbal, Bengaluru', occupation: 'Business', maritalStatus: 'Married', allergies: 'Shellfish', chronicConditions: 'Gout', referredBy: 'Self' },
      { id: 'AURA-2026-0008', name: 'Anjali Desai', dob: '1981-04-12', gender: 'Female', mobile: '9550044556', bloodGroup: 'AB-', emergency: 'Rahul Desai - 9550044557', insurance: 'Max Bupa - POL55490', abhaId: 'anjali@abdm', consentAcademic: true, consentCommercial: true, consentFuture: true, regDate: '2026-05-27T17:00:00Z', status: 'Booked', photo: '', address: 'Malleshwaram, Bengaluru', occupation: 'Artist', maritalStatus: 'Married', allergies: 'None', chronicConditions: 'None', referredBy: 'Self' },
      { id: 'AURA-2026-0009', name: 'David Dsouza', dob: '1965-09-18', gender: 'Male', mobile: '9440055667', bloodGroup: 'O+', emergency: 'Mary Dsouza - 9440055668', insurance: 'Star Health - POL200344', abhaId: 'david@abdm', consentAcademic: true, consentCommercial: false, consentFuture: true, regDate: '2026-05-27T18:00:00Z', status: 'Booked', photo: '', address: 'Richmond Town, Bengaluru', occupation: 'Architect', maritalStatus: 'Married', allergies: 'Sulfa Drugs', chronicConditions: 'Dyslipidemia', referredBy: 'Self' },
      { id: 'AURA-2026-0010', name: 'Meena Kumari', dob: '1952-10-25', gender: 'Female', mobile: '9330066778', bloodGroup: 'A+', emergency: 'Kishore Kumar - 9330066779', insurance: 'N/A', abhaId: '', consentAcademic: false, consentCommercial: false, consentFuture: false, regDate: '2026-05-27T19:00:00Z', status: 'Booked', photo: '', address: 'Rajajinagar, Bengaluru', occupation: 'Homemaker', maritalStatus: 'Widowed', allergies: 'None', chronicConditions: 'Osteoporosis', referredBy: 'Self' }
    ];
    for (const p of seedPatients) {
      const enc = await encryptPatient(p);
      await setDoc(doc(db, "patients", p.id), enc);
    }

    // 2. Appointments (10 records)
    const seedAppointments = Array.from({ length: 10 }, (_, i) => ({
      id: `APT-${String(i+1).padStart(3, '0')}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      doctorId: `doc002`, // Lowercase doc002 (Dr. Ananya Sharma)
      department: 'General Medicine',
      date: new Date().toISOString().split('T')[0],
      time: `${9 + (i % 8)}:00`,
      type: ['New Consultation', 'Follow-up', 'Routine Checkup'][i % 3],
      status: 'In Consultation', // Set active in Consultation queue
      token: i + 1,
      investigationStatus: 'None',
      timestamp: new Date().toISOString()
    }));
    for (const a of seedAppointments) {
      await setDoc(doc(db, "appointments", a.id), a);
    }

    // 3. Devices (10 records)
    const seedDevices = Array.from({ length: 10 }, (_, i) => ({
      id: `DEV-${String(i+1).padStart(3, '0')}`,
      name: ['Philips Multi-Monitor', 'Maquet Ventilator v2', 'GE Mac ECG Machine', 'Siemens Mobile X-Ray', 'Philips Ingenia MRI', 'Toshiba Aquilion CT Scanner', 'Sonosite Ultrasound', 'Zoll Defibrillator', 'Alaris Infusion Pump', 'Mindray Hematology Analyzer'][i],
      type: ['Monitor', 'Ventilator', 'ECG', 'X-Ray', 'MRI', 'CT Scanner', 'Ultrasound', 'Defibrillator', 'Infusion Pump', 'Analyzer'][i],
      department: ['Emergency', 'ICU', 'Cardiology', 'Radiology', 'Radiology', 'Radiology', 'OB-GYN', 'Emergency', 'ICU', 'Pathology'][i],
      location: `Room ${i + 1}`,
      serialNumber: `SN-${100000 + i * 5432}`,
      status: ['Active', 'Under Maintenance', 'Decommissioned'][i % 3],
      lastServiceDate: '2026-04-12',
      maintenanceDue: '2026-10-12',
      notes: `Biomedical Team checked calibration on 2026-04-12. Running firmware v${i}.1.`
    }));
    for (const d of seedDevices) {
      await setDoc(doc(db, "devices", d.id), d);
    }

    // 4. Complaints (10 records)
    const seedComplaints = Array.from({ length: 10 }, (_, i) => ({
      id: `TKT-${String(i+1).padStart(3, '0')}`,
      title: ['MRI cooling system leak', 'OPD AC not working', 'HIS system slow response', 'Glove stock depleted Ward B', 'Lab drain blockage', 'Defibrillator battery low', 'Nurse roster mismatch', 'Pharmacy printer jam', 'Wheelchair lock broken', 'Radiology workstation display flicker'][i],
      category: ['Device Malfunction', 'Infrastructure', 'IT/Software', 'Staffing/Supply', 'Hygiene', 'Device Malfunction', 'Staffing/Supply', 'IT/Software', 'Infrastructure', 'Device Malfunction'][i],
      department: ['Radiology', 'Reception', 'Billing', 'Nursing', 'Pathology', 'Emergency', 'Nursing', 'Pharmacy', 'Reception', 'Radiology'][i],
      priority: ['Critical', 'Medium', 'High', 'Low'][i % 4],
      status: ['Open', 'In Progress', 'Resolved'][i % 3],
      reportedBy: ['Dr. Sunita Rao', 'Kiran G.', 'Divya Iyer', 'Sister Prema', 'Dr. Rajesh Patel', 'Suresh Gowda', 'Sister Mini', 'Alok M.', 'Kiran G.', 'Dr. Tarun'][i % 10],
      assignedTo: ['Biomedical Team', 'Maintenance', 'IT Support', 'Procurement', 'Housekeeping', 'Biomedical Team', 'HR Dept', 'IT Support', 'Maintenance', 'Biomedical Team'][i],
      description: `Reported issue regarding ${i}. Require resolution at the earliest.`,
      resolution: i % 3 === 2 ? 'Cleared and checked on site by duty engineer.' : '',
      createdAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      resolvedAt: i % 3 === 2 ? new Date().toISOString() : ''
    }));
    for (const c of seedComplaints) {
      await setDoc(doc(db, "complaints", c.id), c);
    }

    // 5. Notifications (10 records)
    const seedNotifications = Array.from({ length: 10 }, (_, i) => ({
      id: `NOTIF-${String(i+1).padStart(3, '0')}`,
      title: ['Critical Lab Value Alert', 'New Teleconsultation Assigned', 'Narcotics Register Update Required', 'Bed Grid Transfer Alert', 'Equipment Maintenance Due', 'Blood Stock Level Low (O-)', 'Shift Handover Complete', 'New Patient Check-in', 'IPD Interim Bill Due', 'Triage T1 Alert - ER'][i % 10],
      message: `System notification alert detail for item #${i+1}. Action requested.`,
      type: ['Critical', 'Warning', 'Info', 'Success'][i % 4],
      read: i % 3 === 0,
      timestamp: new Date(Date.now() - i * 2 * 3600 * 1000).toISOString()
    }));
    for (const n of seedNotifications) {
      await setDoc(doc(db, "notifications", n.id), n);
    }

    // 6. Vitals (10 records)
    const seedVitals = Array.from({ length: 10 }, (_, i) => ({
      id: `VIT-${String(i+1).padStart(3, '0')}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      bp: `${110 + (i % 5) * 10}/${70 + (i % 4) * 8}`,
      temp: (98.0 + (i % 6) * 0.4).toFixed(1),
      spo2: 95 + (i % 6),
      pulse: 70 + (i % 6) * 5,
      sugar: 90 + (i % 10) * 12,
      notes: `Vital signs logged at check-in station ${i % 3 + 1}`,
      timestamp: new Date(Date.now() - i * 4 * 3600 * 1000).toISOString()
    }));
    for (const v of seedVitals) {
      await setDoc(doc(db, "vitals", v.id), v);
    }

    // 7. EmergencyCases (10 records)
    const seedEmergency = Array.from({ length: 10 }, (_, i) => ({
      id: `ER-${String(100 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      triageLevel: ['Red', 'Orange', 'Yellow', 'Green', 'Blue'][i % 5],
      chiefComplaint: ['Severe chest pain, breathlessness', 'Suspected stroke, slurred speech', 'Laceration on right leg, bleeding', 'High grade fever with seizures', 'Acute abdominal pain, vomiting', 'RTA head injury, semi-conscious', 'Asthma exacerbation', 'Suspected poisoning', 'Fall with hip fracture', 'Anaphylactic shock'][i],
      broughtBy: ['Ambulance (108)', 'Spouse', 'Friend', 'Parents', 'Brother', 'Police (MLC)', 'Self', 'Neighbor', 'Son', 'Ambulance (108)'][i],
      timeOfArrival: new Date(Date.now() - i * 2 * 3600 * 1000).toISOString(),
      status: ['Active', 'Completed', 'Transferred'][i % 3],
      disposition: ['Resus', 'ER Bed', 'ICU Admitted', 'Discharged'][i % 4],
      mlcFlag: i % 4 === 0,
      mlcDetails: i % 4 === 0 ? { firNumber: `FIR-2026-${200 + i}`, policeStation: 'Halasuru Police', injuryType: 'Physical Trauma', timestamp: new Date().toISOString() } : null
    }));
    for (const ec of seedEmergency) {
      await setDoc(doc(db, "emergencyCases", ec.id), ec);
    }

    // 8. IcuAdmissions (10 records)
    const seedIcu = Array.from({ length: 10 }, (_, i) => ({
      id: `ICU-ADM-${String(200 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      bedNumber: `ICU-Bed ${i + 1}`,
      diagnosis: ['Acute Coronary Syndrome', 'Ischemic Stroke', 'Polytrauma (Post-Op)', 'Septic Shock', 'Acute Respiratory Distress', 'Post Cardiac Arrest Care', 'Hepatic Encephalopathy', 'Diabetic Ketoacidosis', 'Severe Pancreatitis', 'Meningitis'][i],
      ventilatorStatus: i % 3 === 0,
      isolationFlag: i % 4 === 0,
      acuityLevel: ['Critical', 'Stable', 'Improving'][i % 3],
      nurseId: 'STF003',
      apacheScore: 10 + i * 2.5,
      sofaScore: 2 + i,
      ewsScore: (i % 6) + 2,
      timestamp: new Date(Date.now() - i * 24 * 3600 * 1000).toISOString()
    }));
    for (const ic of seedIcu) {
      await setDoc(doc(db, "icuAdmissions", ic.id), ic);
    }

    // 9. IcuCharting (10 records)
    const seedIcuCharting = Array.from({ length: 10 }, (_, i) => ({
      id: `ICU-V-${String(300 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      type: 'Vitals',
      hr: 70 + (i % 5) * 8,
      spo2: 92 + (i % 8),
      rr: 14 + (i % 4) * 2,
      etco2: 32 + (i % 5) * 2,
      recordedBy: ['Nurse Prema', 'Nurse Ritu', 'Nurse Mary'][i % 3],
      timestamp: new Date(Date.now() - i * 3600 * 1000).toISOString()
    }));
    for (const ch of seedIcuCharting) {
      await setDoc(doc(db, "icuCharting", ch.id), ch);
    }

    // 10. Surgeries (10 records)
    const seedSurgeries = Array.from({ length: 10 }, (_, i) => ({
      id: `SURG-${String(300 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      procedureName: ['Coronary Artery Bypass Graft (CABG)', 'Open Reduction Internal Fixation (ORIF)', 'Laparoscopic Appendectomy', 'Cholecystectomy', 'Hernioplasty', 'Cesarean Section', 'Total Knee Arthroplasty', 'Tympanoplasty', 'Craniotomy', 'Mastectomy'][i],
      surgeonId: `DOC00${(i % 4) + 1}`,
      anesthetistId: `DOC00${((i+1) % 4) + 1}`,
      roomNumber: `OT-${(i % 3) + 1}`,
      scheduledDate: new Date(Date.now() + (i - 1) * 24 * 3600 * 1000).toISOString().split('T')[0],
      scheduledTime: `${8 + (i % 5) * 2}:30`,
      status: ['Scheduled', 'In-Progress', 'Completed'][i % 3],
      preOpChecklist: { identityConfirmed: true, siteMarked: i % 2 === 0, anesthesiaSafetyChecked: true, pulseOximeterActive: true, teamIntroduced: true, procedureConfirmed: true, antibioticsGiven: true }
    }));
    for (const sg of seedSurgeries) {
      await setDoc(doc(db, "surgeries", sg.id), sg);
    }

    // 11. OtSchedule (10 records)
    const seedOtSchedule = Array.from({ length: 10 }, (_, i) => ({
      id: `OTS-${String(i+1).padStart(3, '0')}`,
      roomNumber: `OT-${(i % 3) + 1}`,
      procedureName: ['CABG', 'ORIF', 'Appendectomy', 'Cholecystectomy', 'Hernia Repair', 'C-Section', 'Knee Joint Replacement', 'Tympanoplasty', 'Craniotomy', 'Mastectomy'][i],
      surgeonId: `DOC00${(i % 4) + 1}`,
      date: new Date(Date.now() + (i - 1) * 24 * 3600 * 1000).toISOString().split('T')[0],
      time: `${8 + (i % 5) * 2}:30`,
      status: ['Scheduled', 'In-Progress', 'Completed'][i % 3]
    }));
    for (const ot of seedOtSchedule) {
      await setDoc(doc(db, "otSchedule", ot.id), ot);
    }

    // 12. BloodInventory (10 records)
    const seedBlood = [
      { id: 'BLD-A-POS', bloodGroup: 'A+', component: 'Whole Blood', units: 14, expiry: '2026-07-20' },
      { id: 'BLD-A-NEG', bloodGroup: 'A-', component: 'PRBC', units: 4, expiry: '2026-07-15' },
      { id: 'BLD-B-POS', bloodGroup: 'B+', component: 'FFP', units: 18, expiry: '2026-08-12' },
      { id: 'BLD-B-NEG', bloodGroup: 'B-', component: 'Platelets', units: 3, expiry: '2026-07-02' },
      { id: 'BLD-AB-POS', bloodGroup: 'AB+', component: 'Whole Blood', units: 8, expiry: '2026-07-28' },
      { id: 'BLD-AB-NEG', bloodGroup: 'AB-', component: 'PRBC', units: 2, expiry: '2026-07-09' },
      { id: 'BLD-O-POS', bloodGroup: 'O+', component: 'Platelets', units: 25, expiry: '2026-07-05' },
      { id: 'BLD-O-NEG', bloodGroup: 'O-', component: 'PRBC', units: 6, expiry: '2026-07-18' },
      { id: 'BLD-A-POS-FFP', bloodGroup: 'A+', component: 'FFP', units: 9, expiry: '2026-08-01' },
      { id: 'BLD-B-POS-PRBC', bloodGroup: 'B+', component: 'PRBC', units: 12, expiry: '2026-07-31' }
    ];
    for (const bl of seedBlood) {
      await setDoc(doc(db, "bloodInventory", bl.id), bl);
    }

    // 13. Donors (10 records)
    const seedDonors = Array.from({ length: 10 }, (_, i) => ({
      id: `DON-${String(400 + i + 1)}`,
      name: ['Kumar Mangalam', 'Sunita Deshmukh', 'Amanpreet Singh', 'Nisha Hegde', 'Robert Dcosta', 'Zaheer Khan', 'Kavita Roy', 'Joseph John', 'Sneha Patil', 'Vikas Gowda'][i],
      age: 20 + i * 3,
      bloodGroup: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'A+', 'B+'][i],
      mobile: `9876500${100 + i}`,
      donationDate: new Date(Date.now() - i * 15 * 24 * 3600 * 1000).toISOString(),
      eligibility: 'Eligible'
    }));
    for (const d of seedDonors) {
      await setDoc(doc(db, "donors", d.id), d);
    }

    // 14. BloodRequests (10 records)
    const seedBloodRequests = Array.from({ length: 10 }, (_, i) => ({
      id: `REQ-${String(900 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      bloodGroup: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'A+', 'B+'][i],
      units: (i % 3) + 1,
      status: ['Pending', 'Approved / Matched', 'Issued'][i % 3]
    }));
    for (const br of seedBloodRequests) {
      await setDoc(doc(db, "bloodRequests", br.id), br);
    }

    // 15. DietOrders (10 records)
    const seedDietOrders = Array.from({ length: 10 }, (_, i) => ({
      id: `DIET-${String(500 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      dietType: ['Cardiac / Low Sodium', 'Regular Standard', 'Diabetic Carbohydrate Restricted', 'Renal Protein Restricted', 'Clear Liquid', 'NBM (Fasting)'][i % 6],
      preference: ['Veg', 'Non-Veg', 'Egg'][i % 3],
      allergens: i % 4 === 0 ? ['Nuts'] : i % 4 === 1 ? ['Gluten'] : [],
      breakfast: ['Prepared', 'Consumed', 'Pending'][i % 3],
      lunch: ['Pending', 'Prepared', 'Consumed'][i % 3],
      dinner: ['Pending', 'Prepared', 'Consumed'][i % 3]
    }));
    for (const dt of seedDietOrders) {
      await setDoc(doc(db, "dietOrders", dt.id), dt);
    }

    // 16. AmbulanceFleet (10 records)
    const seedAmbulanceFleet = Array.from({ length: 10 }, (_, i) => ({
      id: `AMB-${String(i+1).padStart(2, '0')}`,
      vehicleNum: `KA-03-GA-${1102 + i}`,
      type: ['Advanced Life Support (ALS)', 'Basic Life Support (BLS)', 'Patient Transport Van'][i % 3],
      status: ['Available', 'Dispatched', 'On-Scene', 'Out of Service'][i % 4],
      insuranceExpiry: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0],
      lastServiceDate: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().split('T')[0]
    }));
    for (const am of seedAmbulanceFleet) {
      await setDoc(doc(db, "ambulanceFleet", am.id), am);
    }

    // 17. AmbulanceTrips (10 records)
    const seedAmbulanceTrips = Array.from({ length: 10 }, (_, i) => ({
      id: `TRP-${String(800 + i + 1)}`,
      vehicleId: `AMB-${String((i % 10) + 1).padStart(2, '0')}`,
      callerName: ['Asha Hegde', 'Ramesh Gowda', 'Kiran Patel', 'Sneha Das', 'John Mathew', 'Meena Rao', 'David Wilson', 'Rita Sen', 'Alok Nath', 'Vijay Shekar'][i],
      pickupLocation: ['MG Road Metro Station', 'Indiranagar 100ft Rd', 'Whitefield ITPL', 'Koramangala 5th Block', 'Jayanagar 4th Block', 'Malleshwaram 8th Cross', 'Hebbal Flyover', 'Electronic City Phase 1', 'Banashankari 3rd Stage', 'Yelahanka New Town'][i],
      chiefComplaint: ['Suspected trauma after fall', 'Severe breathing difficulty', 'Cardiac chest discomfort', 'High speed collision injury', 'Acute respiratory failure', 'Unconscious patient', 'Laceration with bleeding', 'Pregnancy labor pains', 'Severe burn injury', 'Anaphylactic allergic attack'][i],
      urgency: ['High', 'Critical', 'Routine'][i % 3],
      status: ['Dispatched', 'On-Scene', 'Arrived Hospital'][i % 3],
      timestamps: { callReceived: new Date().toISOString() }
    }));
    for (const tr of seedAmbulanceTrips) {
      await setDoc(doc(db, "ambulanceTrips", tr.id), tr);
    }

    // 18. ClinicalRecords (10 records)
    const seedClinicalRecords = Array.from({ length: 10 }, (_, i) => ({
      id: `CLN-${String(600 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      doctorId: `DOC00${(i % 4) + 1}`,
      doctorName: ['Dr. Vikranth Reddy', 'Dr. Ananya Sharma', 'Dr. Sanjay Sen', 'Dr. Meera Nair'][i % 4],
      date: new Date(Date.now() - i * 2 * 24 * 3600 * 1000).toISOString(),
      s: ['Patient complains of mild chest tightness.', 'Follow-up consultation for blood sugar check.', 'Knee joint pain after minor twist.', 'Cough and throat irritation since 3 days.', 'Routine health checkup requested.', 'Gastric discomfort after meals.', 'Mild dyspnea on exertion.', 'Review post-op healing progress.', 'Headache and sleep disturbance.', 'Pediatric vaccination review.'][i],
      o: 'Vital signs stable. Heart sounds normal. Lungs clear.',
      a: [['Acute Coronary Syndrome'], ['Type 2 Diabetes Mellitus'], ['Osteoarthritis'], ['Acute Bronchitis'], ['Essential Hypertension'], ['Dyspepsia'], ['Angina Pectoris'], ['Post-Op Status'], ['Migraine'], ['Immunization Complete'][i % 10]],
      p: 'Prescribed daily medicine regime and light exercises.',
      medicines: [{ name: 'Medication - Paracetamol 650mg', dose: '1-0-1', freq: 'After meals', duration: '5 Days' }],
      signed: true,
      signee: ['Dr. Vikranth Reddy', 'Dr. Ananya Sharma', 'Dr. Sanjay Sen', 'Dr. Meera Nair'][i % 4],
      consentFlag: true
    }));
    for (const c of seedClinicalRecords) {
      await setDoc(doc(db, "clinicalRecords", c.id), c);
    }

    // 19. BillingInvoices (10 records)
    const seedBillingInvoices = Array.from({ length: 10 }, (_, i) => ({
      id: `INV-${String(700 + i + 1)}`,
      patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      services: [{ description: ['Outpatient Consultation', 'X-Ray Imaging', 'Pharmacy Dispense', 'Laboratory Panel', 'Ambulance Charge'][i % 5], quantity: 1, rate: [500, 1200, 850, 1500, 1500][i % 5], amount: [500, 1200, 850, 1500, 1500][i % 5] }],
      subtotal: [500, 1200, 850, 1500, 1500][i % 5],
      gst: Math.round([500, 1200, 850, 1500, 1500][i % 5] * 0.05),
      insuranceCover: i % 3 === 0 ? 300 : 0,
      total: Math.round([500, 1200, 850, 1500, 1500][i % 5] * 1.05) - (i % 3 === 0 ? 300 : 0),
      status: 'Pending',
      paymentMode: 'Cash',
      date: new Date(Date.now() - i * 24 * 3600 * 1000).toISOString()
    }));
    for (const b of seedBillingInvoices) {
      await setDoc(doc(db, "billingInvoices", b.id), b);
    }

    // 20. Messages (10 records)
    const seedMessages = Array.from({ length: 10 }, (_, i) => ({
      id: `MSG-${String(i+1).padStart(3, '0')}`,
      senderId: i % 2 === 0 ? `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}` : `DOC00${(i % 4) + 1}`,
      receiverId: i % 2 === 0 ? `DOC00${(i % 4) + 1}` : `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
      senderName: i % 2 === 0 ? 'Patient Portal User' : 'Dr. Consultant',
      text: `Mock message text conversation line #${i+1} for portal sandbox testing.`,
      timestamp: new Date(Date.now() - i * 3600 * 1000).toISOString()
    }));
    for (const m of seedMessages) {
      await setDoc(doc(db, "messages", m.id), m);
    }

    // Seed pharmacy inventory
    const seedPharmacy = [
      { id: 'DRG001', name: 'Paracetamol 650mg', stock: 2400, expiry: '2027-03-15', status: 'OK', batch: 'B101', reorderLevel: 200, category: 'General' },
      { id: 'DRG002', name: 'Metformin 500mg', stock: 1800, expiry: '2027-06-20', status: 'OK', batch: 'B102', reorderLevel: 150, category: 'Diabetic' },
      { id: 'DRG003', name: 'Amlodipine 5mg', stock: 950, expiry: '2027-01-10', status: 'OK', batch: 'B103', reorderLevel: 100, category: 'Cardiac' },
      { id: 'DRG004', name: 'Amoxicillin 500mg', stock: 120, expiry: '2026-09-30', status: 'Low', batch: 'B104', reorderLevel: 200, category: 'Antibiotic' },
      { id: 'DRG005', name: 'Omeprazole 20mg', stock: 3200, expiry: '2027-08-05', status: 'OK', batch: 'B105', reorderLevel: 300, category: 'General' },
      { id: 'DRG006', name: 'Ceftriaxone 1g', stock: 45, expiry: '2026-07-18', status: 'Critical', batch: 'B106', reorderLevel: 50, category: 'Antibiotic' }
    ];
    for (const ph of seedPharmacy) {
      await setDoc(doc(db, "pharmacyInventory", ph.id), ph);
    }

    // Seed lab reagents
    const seedLabReagents = [
      { id: 'REA001', name: 'Glucose Oxidase Kit', stock: 12, expiry: '2026-12-01', status: 'OK', reorderLevel: 5 },
      { id: 'REA002', name: 'HbA1c Reagent Pack', stock: 3, expiry: '2026-10-15', status: 'Low', reorderLevel: 5 },
      { id: 'REA003', name: 'CBC Diluent Lyse', stock: 8, expiry: '2027-03-20', status: 'OK', reorderLevel: 4 },
      { id: 'REA004', name: 'Lipid Assay Standard', stock: 1, expiry: '2026-08-05', status: 'Critical', reorderLevel: 3 }
    ];
    for (const lr of seedLabReagents) {
      await setDoc(doc(db, "labReagents", lr.id), lr);
    }
    // Seed investigations (10 Lab tests, 10 Radiology scans, 10 Prescriptions)
    const seedInvestigations = [];
    for (let i = 0; i < 10; i++) {
      // 10 Lab
      seedInvestigations.push({
        id: `INV-LAB-${String(i+1).padStart(3, '0')}`,
        patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
        testName: ['Fasting Blood Sugar', 'HbA1c', 'Complete Blood Count', 'Lipid Profile', 'Liver Function Test', 'Kidney Function Test', 'Thyroid Profile', 'Urine Routine', 'Serum Electrolytes', 'Blood Grouping'][i],
        type: 'Lab',
        status: 'Pending',
        doctorName: 'Dr. Ananya Sharma',
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      });
      // 10 Radiology
      seedInvestigations.push({
        id: `INV-RAD-${String(i+1).padStart(3, '0')}`,
        patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
        testName: ['Chest X-Ray PA View', 'Ultrasound Abdomen & Pelvis', 'CT Brain (Plain)', 'MRI Spine (Cervical)', 'ECG 12-Lead', '2D Echo', 'CT Chest (High-Res)', 'X-Ray Right Knee', 'Ultrasound Thyroid', 'Mammography'][i],
        type: 'Radiology',
        status: 'Pending',
        doctorName: 'Dr. Ananya Sharma',
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      });
      // 10 Prescriptions
      seedInvestigations.push({
        id: `INV-RX-${String(i+1).padStart(3, '0')}`,
        patientId: `AURA-2026-${String((i % 10) + 1).padStart(4, '0')}`,
        type: 'Prescription',
        status: 'Pending',
        doctorName: 'Dr. Ananya Sharma',
        medicines: [
          { name: ['Paracetamol 650mg', 'Metformin 500mg', 'Amlodipine 5mg', 'Omeprazole 20mg'][i % 4], dose: '1 tab', frequency: 'BD', duration: '5 days', dispenseStatus: 'Pending' }
        ],
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      });
    }

    for (const inv of seedInvestigations) {
      await setDoc(doc(db, "investigations", inv.id), inv);
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
      abhaId: p.abhaId ? await decryptText(p.abhaId) : "",
      address: p.address ? await decryptText(p.address) : "",
      occupation: p.occupation ? await decryptText(p.occupation) : "",
      maritalStatus: p.maritalStatus ? await decryptText(p.maritalStatus) : "",
      allergies: p.allergies ? await decryptText(p.allergies) : "",
      chronicConditions: p.chronicConditions ? await decryptText(p.chronicConditions) : "",
      referredBy: p.referredBy ? await decryptText(p.referredBy) : ""
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

  convex.onUpdate(api.db.getEmergencyCases, {}, (data) => {
    STATE.emergencyCases = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getIcuAdmissions, {}, (data) => {
    STATE.icuAdmissions = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getIcuCharting, {}, (data) => {
    STATE.icuCharting = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getSurgeries, {}, (data) => {
    STATE.surgeries = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getOtSchedule, {}, (data) => {
    STATE.otSchedule = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getBloodInventory, {}, (data) => {
    STATE.bloodInventory = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getBloodRequests, {}, (data) => {
    STATE.bloodRequests = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getDonors, {}, (data) => {
    STATE.donors = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getDietOrders, {}, (data) => {
    STATE.dietOrders = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getAmbulanceTrips, {}, (data) => {
    STATE.ambulanceTrips = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getAmbulanceFleet, {}, (data) => {
    STATE.ambulanceFleet = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getDischargeSummaries, {}, (data) => {
    STATE.dischargeSummaries = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getMessages, {}, (data) => {
    STATE.messages = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getPharmacyInventory, {}, (data) => {
    STATE.pharmacyInventory = data || [];
    renderActivePanel();
  });
  convex.onUpdate(api.db.getLabReagents, {}, (data) => {
    STATE.labReagents = data || [];
    renderActivePanel();
  });

  convex.onUpdate(api.db.getNotifications, {}, (data) => {
    STATE.notifications = data || [];
    updateNotificationBell();
  });

  convex.onUpdate(api.db.getSystemSettings, {}, (data) => {
    STATE.systemSettings = (data && data.length > 0) ? (data.find(d => d.id === 'system-settings') || data[0]) : null;
    applySystemSettingsUI();
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
    { title: 'System Settings', id: 'admin-settings', icon: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }
  ],
  reception: [
    { title: 'Register Patient', id: 'reception-register', icon: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M20 8v6M23 11h-6' },
    { title: 'Appointments Calendar', id: 'reception-calendar', icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18' },
    { title: 'Queue Monitor', id: 'reception-queue-monitor', icon: 'M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z M12 6V12L16 14' }
  ],
  nursing: [
    { title: 'Patient Queue', id: 'nursing-queue', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { title: 'MAR', id: 'nursing-mar', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { title: 'I/O Charts', id: 'nursing-io', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { title: 'Care Plans', id: 'nursing-careplans', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
    { title: 'Shift Handover', id: 'nursing-handover', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { title: 'Bed Management', id: 'nursing-bedmgmt', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }
  ],
  doctor: [
    { title: 'OPD Queue', id: 'doctor-queue', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
    { title: 'IPD Rounds', id: 'doctor-ipd', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { title: 'Discharge Summary', id: 'doctor-discharge', icon: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33' },
    { title: 'Templates', id: 'doctor-templates', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2' }
  ],
  lab: [
    { title: 'Pending Tests', id: 'lab-pending', icon: 'M18.36 2.24a9 9 0 0 1 0 12.72m-2.82-9.9a6 6 0 0 1 0 8.49M12 9A3 3 0 1 1 12 3a3 3 0 0 1 0 6z' },
    { title: 'Completed Reports', id: 'lab-completed', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2' },
    { title: 'Sample Tracker', id: 'lab-tracker', icon: 'M12 22C17.5228 22 22 17.5228 22 12' },
    { title: 'QC Dashboard', id: 'lab-qc', icon: 'M19.4 15a1.65' },
    { title: 'Reagent Stock', id: 'lab-reagents', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }
  ],
  radiology: [
    { title: 'Imaging Queue', id: 'radiology-queue', icon: 'M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1M12 7v10M8 12h8' },
    { title: 'Completed Studies', id: 'radiology-completed', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2' },
    { title: 'Schedule Scans', id: 'radiology-schedule', icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6' },
    { title: 'TAT Metrics', id: 'radiology-tat', icon: 'M12 22C17.5228 22 22 17.5228 22 12' }
  ],
  pharmacy: [
    { title: 'Dispense Queue', id: 'pharmacy-queue', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { title: 'Drug Inventory', id: 'pharmacy-inventory', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7' },
    { title: 'Expiry Management', id: 'pharmacy-expiry', icon: 'M12 22C17.5228 22 22 17.5228 22 12' },
    { title: 'Purchase Orders', id: 'pharmacy-po', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' }
  ],
  finance: [
    { title: 'Pending Bills', id: 'finance-pending', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { title: 'Paid History', id: 'finance-paid', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2' },
    { title: 'Daily Collection', id: 'finance-daily', icon: 'M12 22C17.5228 22 22 17.5228 22 12' },
    { title: 'Revenue Analytics', id: 'finance-analytics', icon: 'M19.4 15a1.65' },
    { title: 'Outstanding Dues', id: 'finance-outstanding', icon: 'M12 1v22' }
  ],
  emergency: [
    { title: 'Triage Board', id: 'emergency-triage', icon: 'M12 22C17.5228 22 22 17.5228 22 12' },
    { title: 'Quick Registration', id: 'emergency-quickreg', icon: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { title: 'Resuscitation Zone', id: 'emergency-resus', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { title: 'ER Bed Status', id: 'emergency-beds', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { title: 'MLC Register', id: 'emergency-mlc', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { title: 'Shift Handover', id: 'emergency-handover', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }
  ],
  icu: [
    { title: 'ICU Overview', id: 'icu-overview', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { title: 'Patient Monitor', id: 'icu-monitor', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { title: 'Daily Rounds', id: 'icu-rounds', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7' },
    { title: 'Procedure Log', id: 'icu-procedures', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' },
    { title: 'Scoring & Alerts', id: 'icu-alerts', icon: 'M19.4 15a1.65' }
  ],
  ot: [
    { title: 'OT Schedule', id: 'ot-schedule', icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6' },
    { title: 'Book Surgery', id: 'ot-booking', icon: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M20 8v6' },
    { title: 'Pre-Op Checklist', id: 'ot-checklist', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7' },
    { title: 'Operative Notes', id: 'ot-intra', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' },
    { title: 'Post-Op Recovery', id: 'ot-recovery', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { title: 'OT Analytics', id: 'ot-analytics', icon: 'M19.4 15a1.65' }
  ],
  bloodbank: [
    { title: 'Blood Stock', id: 'bloodbank-stock', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { title: 'Donor Register', id: 'bloodbank-donor', icon: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { title: 'Donation Record', id: 'bloodbank-donation', icon: 'M14 2H6a2 2 0 0 0-2 2v16' },
    { title: 'Cross-Match', id: 'bloodbank-crossmatch', icon: 'M12 22C17.5228 22 22 17.5228 22 12' },
    { title: 'Issue / Return', id: 'bloodbank-issue', icon: 'M12 1v22' }
  ],
  diet: [
    { title: 'Kitchen Summary', id: 'diet-kitchen', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { title: 'Diet Orders', id: 'diet-orders', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' },
    { title: 'Nutrition Screening', id: 'diet-screening', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7' },
    { title: 'Meal Tracker', id: 'diet-tracker', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' }
  ],
  transport: [
    { title: 'Dispatch', id: 'transport-dispatch', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { title: 'Fleet Status', id: 'transport-fleet', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { title: 'Trip Log', id: 'transport-trips', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' },
    { title: 'Vehicle Management', id: 'transport-vehicles', icon: 'M19.4 15a1.65' }
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
  
  // Hide all outer role panels
  document.querySelectorAll('.role-panel').forEach(panel => {
    panel.style.display = 'none';
  });
  
  // Globally hide all sub-panels first to avoid overlap
  document.querySelectorAll('.sub-panel').forEach(sub => {
    sub.style.display = 'none';
  });
  
  // Hide settings page
  const settingsPage = document.getElementById('page-system-settings');
  if (settingsPage) settingsPage.style.display = 'none';
  
  // Find outer role panel for current activeRole
  let targetRolePanelId = `role-panel-${STATE.activeRole}`;
  if (STATE.activeRole === 'radiology') targetRolePanelId = 'role-panel-radiology';
  if (STATE.activeRole === 'pharmacy') targetRolePanelId = 'role-panel-pharmacy';
  if (STATE.activeRole === 'finance') targetRolePanelId = 'role-panel-finance';
  
  const outerPanel = document.getElementById(targetRolePanelId);
  if (outerPanel) {
    outerPanel.style.display = 'block';
    
    // Show active sub-panel
    const activeSub = document.getElementById(panelId);
    if (activeSub) {
      activeSub.style.display = 'block';
    }
  } else if (panelId === 'admin-settings') {
    if (settingsPage) settingsPage.style.display = 'block';
  }
  
  // Also handle sub-panels outside of the outer role panel (show them directly if their role is active)
  const activeSub = document.getElementById(panelId);
  if (activeSub) {
    activeSub.style.display = 'block';
  }

  
  // Update sidebar active classes
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.dataset.panel === panelId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  const title = document.getElementById('current-panel-title');
  const subtitle = document.getElementById('current-panel-subtitle');
  
  const panelTitles = {
    // Reception
    'reception-register': { title: 'Patient Onboarding', sub: 'Register new patient profiles and check ABDM/ABHA linking.' },
    'reception-calendar': { title: 'Appointments Calendar', sub: 'Manage physician slot scheduling and bookings.' },
    'reception-queue-monitor': { title: 'OPD Queue Monitor', sub: 'Real-time department wait list and token tracking.' },
    // Nursing
    'nursing-queue': { title: 'Nursing Vitals Station', sub: 'Record patient vitals and check allergy alerts.' },
    'nursing-mar': { title: 'Medication Administration Record (MAR)', sub: 'Track and sign-off patient medication schedules.' },
    'nursing-io': { title: 'Intake / Output Charts', sub: 'Log patient fluid intake, output, and running balance.' },
    'nursing-careplans': { title: 'Nursing Care Plans', sub: 'Assess patient problems, goals, and care interventions.' },
    'nursing-handover': { title: 'Shift Handover (ISBAR)', sub: 'Provide structured clinical handovers for shift change.' },
    'nursing-bedmgmt': { title: 'Bed Management Board', sub: 'Manage ward bed allocations and patient transfers.' },
    // Doctor
    'doctor-queue': { title: 'Clinical Consult Center', sub: 'Perform patient consultations, write SOAP notes, search ICD-10.' },
    'doctor-ipd': { title: 'Inpatient Rounding Checklist', sub: 'Perform daily IPD rounds and log rounding progress.' },
    'doctor-discharge': { title: 'Discharge Summary Builder', sub: 'Compile medical summary, prescriptions, and release details.' },
    'doctor-templates': { title: 'SOAP Consultation Templates', sub: 'Manage favorite clinical consult templates.' },
    // Lab
    'lab-pending': { title: 'Lab Investigation Queue', sub: 'Enter observed laboratory values for pending test orders.' },
    'lab-completed': { title: 'Finalized Pathology Reports', sub: 'View completed lab reports and historical values.' },
    'lab-tracker': { title: 'Sample Collection Tracker', sub: 'Track accession codes and processing pipeline status.' },
    'lab-qc': { title: 'Quality Control Dashboard', sub: 'Verify laboratory testing accuracy and Turnaround Time (TAT).' },
    'lab-reagents': { title: 'Reagent Stock Management', sub: 'Track reagent quantities, expiry dates, and reorder levels.' },
    // Radiology
    'radiology-queue': { title: 'Radiology Studies Queue', sub: 'Upload imaging scans and report diagnostic observations.' },
    'radiology-completed': { title: 'Completed Imaging Archive', sub: 'Search completed imaging reports and issue amendments.' },
    'radiology-schedule': { title: 'Modality Booking Scheduler', sub: 'Reserve time slots for CT, MRI, X-Ray, and Ultrasound.' },
    'radiology-tat': { title: 'Radiology Performance TAT', sub: 'Monitor average Turnaround Time by scanning modality.' },
    // Pharmacy
    'pharmacy-queue': { title: 'Dispense Queue', sub: 'Review prescriptions, complete drug dispensing, check interactions.' },
    'pharmacy-inventory': { title: 'Pharmacy Inventory', sub: 'Manage live stock levels, batch details, and purchase records.' },
    'pharmacy-expiry': { title: 'Drug Expiry Management', sub: 'Track drugs near expiry (30/60/90 days).' },
    'pharmacy-po': { title: 'Purchase Order Generator', sub: 'Create new stock reorders for suppliers.' },
    // Finance
    'finance-pending': { title: 'Pending Billing Ledger', sub: 'Review services consumed, verify pre-auth, collect payment.' },
    'finance-paid': { title: 'Paid Invoices History', sub: 'Search settled transactions and print copy receipts.' },
    'finance-daily': { title: 'Daily Cash Collection', sub: 'Summarize collected payments by cash, UPI, card, and TPA.' },
    'finance-analytics': { title: 'Revenue & Analytics', sub: 'Analyze department-wise collections and billing trends.' },
    'finance-outstanding': { title: 'Outstanding Dues Aging', sub: 'Track unpaid balances and insurance pre-auth receivables.' },
    // Emergency
    'emergency-triage': { title: 'Emergency Triage Board', sub: 'Real-time Manchester Triage queue color-coded by clinical urgency.' },
    'emergency-quickreg': { title: 'ER Quick Registration', sub: 'Rapidly onboard critical cases with minimal details.' },
    'emergency-resus': { title: 'Resuscitation Zone Monitor', sub: 'Monitor immediate resus (P1) cases, drips, and team logs.' },
    'emergency-beds': { title: 'ER Bed Occupancy', sub: 'Track trauma room beds and clinical assignments.' },
    'emergency-mlc': { title: 'Medico-Legal Cases (MLC)', sub: 'Log police information, FIR numbers, and bodily injury tags.' },
    'emergency-handover': { title: 'ER Shift Handover', sub: 'Active trauma handovers and pending diagnostics.' },
    // ICU
    'icu-overview': { title: 'ICU Bed Map Layout', sub: 'Grid of critical care beds, ventilator status, nurse assignments.' },
    'icu-monitor': { title: 'Patient Vitals Monitor', sub: 'Real-time vitals trends, ventilator parameters, infusion pumps.' },
    'icu-rounds': { title: 'Daily Round Checklist', sub: 'Verify daily checklist (FAST HUG) and clinical scores (SOFA/APACHE).' },
    'icu-procedures': { title: 'Critical Care Procedures Log', sub: 'Record central line, intubation, arterial line insertions.' },
    'icu-alerts': { title: 'Clinical Alerts & Warning Scores', sub: 'Early warning system logs and physiological deterioration triggers.' },
    // OT
    'ot-schedule': { title: 'OT Schedule Board', sub: 'Weekly schedule of OT Rooms and scheduled procedures.' },
    'ot-booking': { title: 'OT Procedure Booking', sub: 'Schedule surgeries, assign surgeon, scrub nurse, anesthesiologist.' },
    'ot-checklist': { title: 'WHO Surgical Checklist', sub: 'Perform digital Sign In, Time Out, Sign Out safety protocols.' },
    'ot-pac': { title: 'Pre-Anesthesia Checkup (PAC)', sub: 'Complete physical airway checks, ASA scoring, and history.' },
    'ot-intra': { title: 'Intra-Operative Record', sub: 'Log periodic vitals, anesthetics administered, fluid balance.' },
    'ot-recovery': { title: 'Post-Op Recovery (Aldrete)', sub: 'Track Aldrete recovery scores and plan patient transfers.' },
    'ot-analytics': { title: 'OT Utilization Performance', sub: 'View surgery volumes, room occupancy, and case cancellations.' },
    // Blood Bank
    'bloodbank-stock': { title: 'Blood Inventory Stock', sub: 'View component stock volumes by ABO/Rh blood groups.' },
    'bloodbank-donor': { title: 'Blood Donor Registry', sub: 'Register donors and document medical pre-screening checks.' },
    'bloodbank-donation': { title: 'Donation Record Log', sub: 'Record blood bag identifiers, collection times, and separation.' },
    'bloodbank-crossmatch': { title: 'Cross-Match Ledger', sub: 'Verify donor compatibilities for pending transfusions.' },
    'bloodbank-issue': { title: 'Transfusion Reactions & Issues', sub: 'Track issued components and document reaction profiles.' },
    // Diet
    'diet-kitchen': { title: 'Dietary Kitchen Summary', sub: 'Ward-wise meal count preparation checklist.' },
    'diet-orders': { title: 'Diet Order Entry', sub: 'Assign patient dietary types, allergy locks, and feeding codes.' },
    'diet-screening': { title: 'Nutritional Risk Screening', sub: 'Run NRS-2002 clinical scoring for malnourished patients.' },
    'diet-tracker': { title: 'Meal Delivery Tracking', sub: 'Log breakfast, lunch, and dinner distribution status.' },
    // Ambulance
    'transport-dispatch': { title: 'Ambulance Dispatch Desk', sub: 'Process emergency calls and assign fleet vehicles.' },
    'transport-fleet': { title: 'Vehicle Fleet Status', sub: 'Monitor ALS, BLS, and transport van readiness.' },
    'transport-trips': { title: 'Ambulance Trip Logs', sub: 'Review pre-hospital care logs, times, and paramedic inputs.' },
    'transport-vehicles': { title: 'Maintenance Registry', sub: 'Track vehicle registration, fitness certificate, and service history.' },
    // Patient Portal
    'patient-mobile': { title: 'Patient Self-Service PWA', sub: 'Simulating mobile portal via registered phone number.' }
  };
  
  const info = panelTitles[panelId] || { title: 'Dashboard', sub: 'Overview' };
  title.textContent = info.title;
  subtitle.textContent = info.sub;
}

function loadDashboardData() {
  // Render active sidebar items
  renderSidebarNav();
  
  // Dynamic sub-panel router
  switch (STATE.activePanel) {
    // Reception
    case 'reception-register':
      populateDoctorsSelect();
      break;
    case 'reception-calendar':
      renderAppointmentsCalendar();
      break;
    case 'reception-queue-monitor':
      renderReceptionQueue();
      break;

    // Nursing
    case 'nursing-queue':
      renderNursingQueue();
      break;
    case 'nursing-mar':
      renderNursingMAR();
      break;
    case 'nursing-io':
      renderNursingIO();
      break;
    case 'nursing-careplans':
      renderNursingCarePlans();
      break;
    case 'nursing-handover':
      renderNursingHandover();
      break;
    case 'nursing-bedmgmt':
      renderNursingBedMgmt();
      break;

    // Doctor
    case 'doctor-queue':
      renderDoctorQueue();
      initDoctorICD10Autocomplete();
      break;
    case 'doctor-ipd':
      renderDoctorIPD();
      break;
    case 'doctor-discharge':
      renderDoctorDischarge();
      break;
    case 'doctor-templates':
      renderDoctorTemplates();
      break;

    // Lab
    case 'lab-pending':
      renderLabQueue();
      break;
    case 'lab-completed':
      renderLabCompleted();
      break;
    case 'lab-tracker':
      renderLabTracker();
      break;
    case 'lab-qc':
      renderLabQC();
      break;
    case 'lab-reagents':
      renderLabReagents();
      break;

    // Radiology
    case 'radiology-queue':
      renderRadiologyQueue();
      break;
    case 'radiology-completed':
      renderRadiologyCompleted();
      break;
    case 'radiology-schedule':
      renderRadiologySchedule();
      break;
    case 'radiology-tat':
      renderRadiologyTAT();
      break;

    // Pharmacy
    case 'pharmacy-queue':
      renderPharmacyQueue();
      break;
    case 'pharmacy-inventory':
      renderPharmacyInventory();
      break;
    case 'pharmacy-expiry':
      renderPharmacyExpiry();
      break;
    case 'pharmacy-po':
      renderPharmacyPO();
      break;

    // Finance
    case 'finance-pending':
      renderFinanceQueue();
      break;
    case 'finance-paid':
      renderFinancePaid();
      break;
    case 'finance-daily':
      renderFinanceDaily();
      break;
    case 'finance-analytics':
      renderFinanceAnalytics();
      break;
    case 'finance-outstanding':
      renderFinanceOutstanding();
      break;

    // Emergency
    case 'emergency-triage':
      renderEmergencyTriage();
      break;
    case 'emergency-resus':
      renderEmergencyResus();
      break;
    case 'emergency-beds':
      renderEmergencyBeds();
      break;
    case 'emergency-mlc':
      renderEmergencyMLC();
      break;
    case 'emergency-handover':
      renderEmergencyHandover();
      break;

    // ICU
    case 'icu-overview':
      renderIcuOverview();
      break;
    case 'icu-monitor':
      renderIcuMonitor();
      break;
    case 'icu-rounds':
      renderIcuRounds();
      break;
    case 'icu-procedures':
      renderIcuProcedures();
      break;
    case 'icu-alerts':
      renderIcuAlerts();
      break;

    // OT
    case 'ot-schedule':
      renderOtSchedule();
      break;
    case 'ot-booking':
      renderOtBooking();
      break;
    case 'ot-checklist':
      renderOtChecklist();
      break;
    case 'ot-pac':
      renderOtPac();
      break;
    case 'ot-intra':
      renderOtIntra();
      break;
    case 'ot-recovery':
      renderOtRecovery();
      break;
    case 'ot-analytics':
      renderOtAnalytics();
      break;

    // Blood Bank
    case 'bloodbank-stock':
      renderBloodStock();
      break;
    case 'bloodbank-donor':
      renderBloodDonor();
      break;
    case 'bloodbank-donation':
      renderBloodDonation();
      break;
    case 'bloodbank-crossmatch':
      renderBloodCrossMatch();
      break;
    case 'bloodbank-issue':
      renderBloodIssue();
      break;

    // Diet
    case 'diet-kitchen':
      renderDietKitchen();
      break;
    case 'diet-orders':
      renderDietOrders();
      break;
    case 'diet-screening':
      renderDietScreening();
      break;
    case 'diet-tracker':
      renderDietTracker();
      break;

    // Ambulance
    case 'transport-dispatch':
      renderTransportDispatch();
      break;
    case 'transport-fleet':
      renderTransportFleet();
      break;
    case 'transport-trips':
      renderTransportTrips();
      break;
    case 'transport-vehicles':
      renderTransportVehicles();
      break;

    // Patient
    case 'patient-mobile':
      renderPatientPortalPWA();
      break;

    // Admin
    case 'admin-dashboard':
      renderAdminStaff();
      renderAuditLogs();
      renderAdminDashboardStats();
      break;
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
  const address = document.getElementById('reg-address-street')?.value || '';
  const occupation = document.getElementById('reg-occupation')?.value || '';
  const maritalStatus = document.getElementById('reg-marital')?.value || '';
  const allergies = document.getElementById('reg-allergies')?.value || '';
  const chronicConditions = document.getElementById('reg-chronic')?.value || '';
  const referredBy = document.getElementById('reg-referred-by')?.value || '';
  
  const previewImg = document.querySelector('#patient-photo-preview img');
  const photo = previewImg ? previewImg.src : '';
  
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
    status: 'Booked',
    photo,
    address,
    occupation,
    maritalStatus,
    allergies,
    chronicConditions,
    referredBy
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
  const preview = document.getElementById('patient-photo-preview');
  if (preview) preview.innerHTML = `<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
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
  if (typeof checkDrugInteractions === 'function') checkDrugInteractions();
}

window.updatePrescriptionItem = function(idx, field, val) {
  STATE.doctorConsult.prescriptionMedicines[idx][field] = val;
  if (typeof checkDrugInteractions === 'function') checkDrugInteractions();
};

window.removePrescriptionItem = function(idx) {
  STATE.doctorConsult.prescriptionMedicines.splice(idx, 1);
  renderDoctorPrescriptionTable();
  if (typeof checkDrugInteractions === 'function') checkDrugInteractions();
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
  const docName = STATE.currentUserProfile ? STATE.currentUserProfile.name : "Dr. Vikram Aditya";
  const docLicense = (STATE.currentUserProfile && STATE.currentUserProfile.license) 
                      ? STATE.currentUserProfile.license 
                      : (DOCTORS.find(d => d.name === docName)?.license || "MCI-224190");
  this.textContent = `${docName} [${docLicense}]`;
});

// Submit sign & close consult
document.getElementById('btn-submit-esign').addEventListener('click', () => {
  const pad = document.getElementById('esign-canvas-sim');
  if (!pad.classList.contains('signed')) {
    showToast("Please sign the biometric pad first.", "error");
    return;
  }
  
  const p = STATE.patients.find(pt => pt.id === STATE.selectedPatientId);
  const docId = STATE.currentUserProfile ? STATE.currentUserProfile.id : 'DOC002';
  const docName = STATE.currentUserProfile ? STATE.currentUserProfile.name : 'Dr. Vikram Aditya';
  
  const docNotesId = `CLN-${Date.now().toString().slice(-4)}`;
  
  // Save Clinical Case record
  const newClinical = {
    id: docNotesId,
    patientId: STATE.selectedPatientId,
    doctorId: docId,
    doctorName: docName,
    date: new Date().toISOString(),
    s: document.getElementById('soap-s').value,
    o: document.getElementById('soap-o').value,
    a: [...STATE.doctorConsult.soapA_Tags],
    p: document.getElementById('soap-p').value,
    medicines: [...STATE.doctorConsult.prescriptionMedicines],
    signed: true,
    signee: docName,
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

async function saveLabInvestigationToDb(lab, status, val) {
  try {
    await convex.mutation(api.db.upsertInvestigation, lab);
    if (status === 'Final') {
      logAudit('Create', lab.id, `Report finalized for Lab Test: ${lab.testName} (Value: ${val})`);
      showToast("Lab report compiled and sent to treating doctor.");
      routePatientBackIfAllDone(lab.patientId);
    } else {
      logAudit('Edit', lab.id, `Saved Draft for Lab Test: ${lab.testName}`);
      showToast("Draft details saved to database.");
    }
    
    // Reset workspace
    document.getElementById('lab-workspace').style.display = 'none';
    document.getElementById('lab-empty-state').style.display = 'flex';
    STATE.activeLabOrderId = null;
    renderLabQueue();
  } catch (err) {
    console.error(err);
    showToast("Error saving lab report: " + err.message, "error");
  }
}

async function submitLabReport(status) {
  const val = document.getElementById('lab-param-value').value;
  const notes = document.getElementById('lab-param-notes').value;
  
  if (status === 'Final' && !val) {
    showToast("Please record the observed test parameter value.", "error");
    return;
  }
  
  const lab = STATE.investigations.find(i => i.id === STATE.activeLabOrderId);
  if (!lab) return;
  
  lab.value = val;
  lab.comments = notes || (status === 'Final' ? 'Observations conform to test standards.' : '');
  lab.status = status;
  lab.date = new Date().toISOString();
  if (status === 'Final') {
    lab.returnToDoctor = true;
  }

  const fileInput = document.getElementById('lab-file-pdf');
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
      lab.attachment = e.target.result; // base64 string
      await saveLabInvestigationToDb(lab, status, val);
    };
    reader.readAsDataURL(file);
  } else {
    await saveLabInvestigationToDb(lab, status, val);
  }
}

// Lab marking draft
document.getElementById('btn-lab-mark-pending').addEventListener('click', () => submitLabReport('Draft'));

// Finalize lab test
document.getElementById('btn-lab-submit-final').addEventListener('click', () => submitLabReport('Final'));

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
  const rx = STATE.investigations.find(i => i.id === STATE.activePrescriptionId);
  if (!rx) {
    showToast("Please select a prescription first.", "error");
    return;
  }
  
  const patientName = getPatientName(rx.patientId);
  
  const labelBody = document.getElementById('pharmacy-label-body');
  if (labelBody) {
    let medListHtml = '';
    rx.medicines.forEach(med => {
      const status = med.dispenseStatus || 'Dispensed';
      medListHtml += `
        <div style="margin-bottom:10px;border-bottom:1px solid #ccc;padding-bottom:5px">
          <strong>${med.name.replace('Medication - ', '')}</strong> (${status})<br>
          <small>Dose: ${med.dose} | Frequency: ${med.freq} | Duration: ${med.duration}</small><br>
          <small>Instructions: Take with water after meals.</small>
        </div>
      `;
    });
    
    labelBody.innerHTML = `
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;color:#000">
        <h2 style="font-size:1.1rem;margin:0;">AURATRAL GENERAL HOSPITAL</h2>
        <small>Pharmacy Department | Helpline: +91 80 1234 5678</small>
      </div>
      <div style="color:#000">
        <strong>Patient Name:</strong> ${patientName}<br>
        <strong>Patient ID:</strong> ${rx.patientId}<br>
        <strong>Rx Ref ID:</strong> ${rx.id}<br>
        <strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
      </div>
      <div style="margin-top:15px;margin-bottom:15px;color:#000">
        <h3 style="font-size:0.9rem;margin-bottom:8px;border-bottom:1px solid #000;padding-bottom:3px">PRESCRIBED INSTRUCTIONS</h3>
        ${medListHtml}
      </div>
      <div style="text-align:center;font-size:0.7rem;margin-top:15px;color:#000">
        Keep out of reach of children. Store in a cool dry place.<br>
        <strong>Thank you for choosing Auratral!</strong>
      </div>
    `;
  }
  
  document.getElementById('modal-pharmacy-label').classList.add('open');
  logAudit('View', rx.id, `Printed dispensation label for patient: ${patientName}`);
});

// ==========================================
// 13. MODULE: FINANCE, BILLING & INSURANCE
// ==========================================

function renderFinanceQueue() {
  if (typeof renderFinanceDashboardStats === 'function') renderFinanceDashboardStats();
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
      <td><button class="glass-btn glass-btn-secondary" style="padding:3px 8px;font-size:.72rem" onclick="showDeviceDetails('${dev.id}')">Details</button></td>
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
      <div class="bed-cell" style="background:${colorMap[bed.status]};border:1px solid ${borderMap[bed.status]};border-radius:6px;padding:6px 8px;text-align:center;cursor:pointer;min-width:60px" title="${bed.status}${patient ? ' — ' + patient.name : ''}" onclick="handleBedClick('${bed.id}')">
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
          } else if (targetRole.includes("emergency") || targetRole.includes("er")) {
            STATE.activeRole = "emergency";
          } else if (targetRole.includes("icu")) {
            STATE.activeRole = "icu";
          } else if (targetRole.includes("ot") || targetRole.includes("surgery") || targetRole.includes("surgeon")) {
            STATE.activeRole = "ot";
          } else if (targetRole.includes("bloodbank") || targetRole.includes("blood")) {
            STATE.activeRole = "bloodbank";
          } else if (targetRole.includes("diet") || targetRole.includes("nutrition")) {
            STATE.activeRole = "diet";
          } else if (targetRole.includes("transport") || targetRole.includes("ambulance")) {
            STATE.activeRole = "transport";
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
      document.getElementById('app-layout').style.display = 'flex';

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
      document.getElementById('app-layout').style.display = 'none';
    }
  });
});

// ==========================================
// NEW MODULES CLINICAL BUSINESS LOGIC
// ==========================================

// --- EMERGENCY / TRAUMA ---
window.renderEmergencyTriage = function() {
  const categories = ['Red', 'Orange', 'Yellow', 'Green', 'Blue'];
  categories.forEach(cat => {
    const listEl = document.getElementById(`triage-list-${cat.toLowerCase()}`);
    if (!listEl) return;
    listEl.innerHTML = '';
    
    const cases = STATE.emergencyCases.filter(c => c.triageLevel === cat && c.status === 'Active');
    if (cases.length === 0) {
      listEl.innerHTML = '<div style="font-size:0.7rem; color:var(--text-3); text-align:center; padding:10px;">Empty</div>';
      return;
    }
    
    cases.forEach(c => {
      const p = STATE.patients.find(pt => pt.id === c.patientId);
      const name = p ? p.name : 'Unknown';
      const div = document.createElement('div');
      div.className = 'triage-card';
      div.innerHTML = `
        <div class="triage-card-id">${c.id} (${c.patientId})</div>
        <div class="triage-card-name">${name}</div>
        <div class="triage-card-complaint">${c.chiefComplaint}</div>
        <div style="margin-top:6px; display:flex; gap:4px;">
          <button class="glass-btn glass-btn-primary" style="padding:2px 4px; font-size:0.6rem;" onclick="assignERBay('${c.id}')">Resus</button>
          <button class="glass-btn glass-btn-secondary" style="padding:2px 4px; font-size:0.6rem;" onclick="dischargeERCase('${c.id}')">Release</button>
        </div>
      `;
      listEl.appendChild(div);
    });
  });
};

window.saveERQuickRegistration = function() {
  const name = document.getElementById('er-q-name').value.trim();
  const age = document.getElementById('er-q-age').value.trim();
  const gender = document.getElementById('er-q-gender').value;
  const complaint = document.getElementById('er-q-complaint').value.trim();
  const broughtby = document.getElementById('er-q-broughtby').value.trim();
  const triage = document.getElementById('er-q-triage').value;
  
  const pId = `AURA-ER-${Date.now().toString().slice(-4)}`;
  const caseId = `ER-${Date.now().toString().slice(-4)}`;
  
  const newPatient = {
    id: pId,
    name, dob: 'N/A', gender, mobile: 'N/A', bloodGroup: '', emergency: broughtby,
    insurance: 'N/A', abhaId: '', consentAcademic: true, consentCommercial: false, consentFuture: true,
    regDate: new Date().toISOString(), status: 'ER Queue'
  };
  
  const newCase = {
    id: caseId,
    patientId: pId,
    triageLevel: triage,
    chiefComplaint: complaint,
    broughtBy: broughtby,
    timeOfArrival: new Date().toISOString(),
    status: 'Active',
    disposition: triage === 'Red' ? 'Resus' : 'ER Bed',
    mlcFlag: false
  };
  
  Promise.all([
    mutatePatient(newPatient),
    convex.mutation(api.db.upsertEmergencyCase, newCase)
  ]).then(() => {
    showToast(`Quick ER Onboarded: Case ${caseId}`);
    logAudit('Create', caseId, `Registered ER Quick Case for ${name} (${triage})`);
    document.getElementById('er-q-name').value = '';
    document.getElementById('er-q-complaint').value = '';
    document.getElementById('er-q-broughtby').value = '';
    STATE.activePanel = 'emergency-triage';
    navigateToPanel('emergency-triage');
  }).catch(err => showToast(err.message, 'error'));
};

window.assignERBay = function(caseId) {
  const c = STATE.emergencyCases.find(cs => cs.id === caseId);
  if (!c) return;
  c.disposition = 'Resus';
  convex.mutation(api.db.upsertEmergencyCase, c).then(() => {
    showToast(`Assigned ${caseId} to Resuscitation Zone`);
    window.renderEmergencyTriage();
  });
};

window.dischargeERCase = function(caseId) {
  const c = STATE.emergencyCases.find(cs => cs.id === caseId);
  if (!c) return;
  c.status = 'Completed';
  c.disposition = 'Discharged';
  
  const p = STATE.patients.find(pt => pt.id === c.patientId);
  if (p) {
    p.status = 'Discharged';
  }
  
  Promise.all([
    convex.mutation(api.db.upsertEmergencyCase, c),
    p ? mutatePatient(p) : Promise.resolve()
  ]).then(() => {
    showToast(`ER Case ${caseId} Released`);
    logAudit('Edit', caseId, `Discharged patient from ER`);
    window.renderEmergencyTriage();
  });
};

window.renderEmergencyResus = function() {
  const container = document.getElementById('emergency-resus');
  if (!container) return;
  
  const resusCases = STATE.emergencyCases.filter(c => c.disposition === 'Resus' && c.status === 'Active');
  
  let html = '<h3 class="form-title">Critical Resuscitation Bay (P1 Monitor)</h3>';
  if (resusCases.length === 0) {
    html += '<p style="color:var(--text-3); text-align:center; padding:30px;">No patients currently in Resus Bay.</p>';
    container.innerHTML = html;
    return;
  }
  
  resusCases.forEach(c => {
    const p = STATE.patients.find(pt => pt.id === c.patientId);
    const vitals = STATE.vitals.filter(v => v.patientId === c.patientId).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))[0];
    
    html += `
      <div class="resus-bay">
        <div class="flex-between">
          <strong>${p ? p.name : 'Unknown'} (${c.patientId})</strong>
          <span class="status-indicator status-canceled">P1 - CRITICAL</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-2); margin-top:6px;">
          Complaint: ${c.chiefComplaint} | Arrival: ${new Date(c.timeOfArrival).toLocaleTimeString()}
        </div>
        
        <div class="vitals-grid" style="grid-template-columns: repeat(4, 1fr); margin-top:12px;">
          <div class="vital-box" style="background:#fff;"><div class="vital-box-title">BP</div><div class="vital-box-value">${vitals ? vitals.bp : '110/70'}</div><div class="vital-box-unit">mmHg</div></div>
          <div class="vital-box" style="background:#fff;"><div class="vital-box-title">Pulse</div><div class="vital-box-value">${vitals ? vitals.pulse : '96'}</div><div class="vital-box-unit">bpm</div></div>
          <div class="vital-box" style="background:#fff;"><div class="vital-box-title">SpO2</div><div class="vital-box-value">${vitals ? vitals.spo2 : '91'}</div><div class="vital-box-unit">%</div></div>
          <div class="vital-box" style="background:#fff;"><div class="vital-box-title">Temp</div><div class="vital-box-value">${vitals ? vitals.temp : '99'}</div><div class="vital-box-unit">°F</div></div>
        </div>
        
        <div style="margin-top:10px; display:flex; gap:8px;">
          <button class="glass-btn glass-btn-primary" onclick="admitToICU('${c.patientId}', '${c.id}')">Transfer to ICU</button>
          <button class="glass-btn glass-btn-secondary" onclick="logResusVital('${c.patientId}')">Quick Log Vitals</button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
};

window.admitToICU = function(pId, caseId) {
  const bedNum = prompt("Assign ICU Bed (e.g. ICU-Bed 4):", "ICU-Bed 4");
  if (!bedNum) return;
  
  const c = STATE.emergencyCases.find(cs => cs.id === caseId);
  if (c) {
    c.status = 'Transferred';
    c.disposition = 'ICU Admitted';
  }
  
  const newAdmission = {
    id: `ICU-ADM-${Date.now()}`,
    patientId: pId,
    bedNumber: bedNum,
    diagnosis: c ? c.chiefComplaint : 'ER Trauma Transfer',
    ventilatorStatus: false,
    isolationFlag: false,
    acuityLevel: 'Critical',
    nurseId: 'STF003',
    apacheScore: 18,
    sofaScore: 5,
    ewsScore: 4,
    timestamp: new Date().toISOString()
  };
  
  const pat = STATE.patients.find(pt => pt.id === pId);
  if (pat) {
    pat.bedAssignment = bedNum;
    pat.status = 'Admitted';
  }
  
  Promise.all([
    c ? convex.mutation(api.db.upsertEmergencyCase, c) : Promise.resolve(),
    pat ? mutatePatient(pat) : Promise.resolve(),
    convex.mutation(api.db.upsertIcuAdmission, newAdmission)
  ]).then(() => {
    showToast(`Admitted ${pId} to ICU bed: ${bedNum}`);
    logAudit('Edit', pId, `Transferred ER patient to ICU`);
    window.renderEmergencyResus();
  }).catch(err => showToast(err.message, 'error'));
};

window.logResusVital = function(pId) {
  const bp = prompt("BP (mmHg):", "120/80");
  const pulse = parseInt(prompt("Pulse (bpm):", "72")) || 72;
  const spo2 = parseInt(prompt("SpO2 (%):", "98")) || 98;
  
  const newVital = {
    id: `VIT-${Date.now()}`,
    patientId: pId,
    bp, pulse, spo2, temp: 98.6, sugar: 100, notes: 'ER Resus Vital',
    timestamp: new Date().toISOString()
  };
  
  convex.mutation(api.db.upsertVitals, newVital).then(() => {
    showToast("Vitals saved.");
    window.renderEmergencyResus();
  });
};

window.renderEmergencyBeds = function() {
  const container = document.getElementById('emergency-beds');
  if (!container) return;
  
  let bedsHtml = '';
  for(let i=1; i<=8; i++) {
    const bedName = `ER-Bed ${i}`;
    const activeCase = STATE.emergencyCases.find(c => c.disposition === 'ER Bed' && c.status === 'Active');
    const occupied = activeCase ? true : false;
    
    bedsHtml += `
      <div class="glass-card" style="border-left:5px solid ${occupied ? 'var(--info)' : 'var(--success)'}; text-align:center; padding:10px;">
        <strong>${bedName}</strong>
        <p style="font-size:0.75rem; margin:6px 0;">${occupied ? `Case: ${activeCase.id}` : 'Available'}</p>
      </div>
    `;
  }
  
  container.innerHTML = `
    <h3 class="form-title">Emergency Bed Board</h3>
    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-top:12px;">
      ${bedsHtml}
    </div>
  `;
};

window.renderEmergencyMLC = function() {
  const container = document.getElementById('emergency-mlc');
  if (!container) return;
  
  const mlcList = STATE.emergencyCases.filter(c => c.mlcFlag);
  let rows = mlcList.map(m => `
    <tr>
      <td>${m.id}</td>
      <td><code>${m.patientId}</code></td>
      <td>${m.mlcDetails ? m.mlcDetails.injuryType : 'Trauma'}</td>
      <td>${m.mlcDetails ? m.mlcDetails.firNumber : '-'}</td>
      <td>${m.mlcDetails ? m.mlcDetails.policeStation : '-'}</td>
      <td>${new Date(m.timeOfArrival).toLocaleDateString()}</td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1.2fr 2fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">File MLC (Medico-Legal Case)</h3>
        <form onsubmit="event.preventDefault(); saveMLC()">
          <div class="form-group"><label>Select Active ER Case *</label>
            <select id="mlc-case-id" required>
              ${STATE.emergencyCases.filter(c => c.status === 'Active' && !c.mlcFlag).map(c => `<option value="${c.id}">${c.id} - Patient: ${c.patientId}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>FIR / Police Report Number *</label><input type="text" id="mlc-fir" placeholder="FIR-2026-X" required></div>
          <div class="form-group"><label>Police Station Jurisdiction *</label><input type="text" id="mlc-station" placeholder="Halasuru Police" required></div>
          <div class="form-group"><label>Injury Details & Classification *</label><input type="text" id="mlc-injury" placeholder="Laceration, blunt trauma" required></div>
          <button class="glass-btn glass-btn-primary" type="submit">File MLC Record</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">Active MLC Register</h3>
        <div class="table-wrapper">
          <table class="ehr-table">
            <thead>
              <tr><th>Case ID</th><th>Patient</th><th>Injury</th><th>FIR #</th><th>Jurisdiction</th><th>Date</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No MLC cases registered.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
};

window.saveMLC = function() {
  const caseId = document.getElementById('mlc-case-id').value;
  const fir = document.getElementById('mlc-fir').value;
  const station = document.getElementById('mlc-station').value;
  const injury = document.getElementById('mlc-injury').value;
  
  const c = STATE.emergencyCases.find(cs => cs.id === caseId);
  if (!c) return;
  
  c.mlcFlag = true;
  c.mlcDetails = {
    firNumber: fir,
    policeStation: station,
    injuryType: injury,
    timestamp: new Date().toISOString()
  };
  
  convex.mutation(api.db.upsertEmergencyCase, c).then(() => {
    showToast("MLC Record filed successfully.");
    logAudit('Edit', caseId, `Filed MLC record: FIR ${fir}`);
    window.renderEmergencyMLC();
  });
};

window.renderEmergencyHandover = function() {
  const container = document.getElementById('emergency-handover');
  if (!container) return;
  
  const handovers = STATE.clinicalRecords.filter(r => r.type === 'ERHandover');
  let cards = handovers.map(h => `
    <div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.75rem;">
      <div class="flex-between"><strong>Outgoing: ${h.nurseName}</strong> <span>${new Date(h.timestamp).toLocaleTimeString()}</span></div>
      <div style="margin-top:4px;">Pending Tasks: ${h.notes}</div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1fr 1fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">ER Shift Handover log</h3>
        <form onsubmit="event.preventDefault(); saveERHandover()">
          <div class="form-group">
            <label>Incoming Doctor / Nurse Name *</label>
            <input type="text" id="er-ho-incoming" required placeholder="Dr. Suresh Gowda">
          </div>
          <div class="form-group">
            <label>Pending Investigations & Critical Notes *</label>
            <textarea id="er-ho-notes" required placeholder="3 CT Brain pending, 2 Resus beds occupied. Blood ordered."></textarea>
          </div>
          <button class="glass-btn glass-btn-primary" type="submit">Sign Off ER Handover</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">ER Handover Logs</h3>
        <div style="max-height: 350px; overflow-y: auto;">
          ${cards || '<p style="color:var(--text-3); text-align:center;">No handovers recorded.</p>'}
        </div>
      </div>
    </div>
  `;
};

window.saveERHandover = function() {
  const incoming = document.getElementById('er-ho-incoming').value;
  const notes = document.getElementById('er-ho-notes').value;
  
  const h = {
    id: `ERHO-${Date.now()}`,
    type: 'ERHandover',
    incoming,
    notes,
    timestamp: new Date().toISOString(),
    nurseName: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'Staff Nurse'
  };
  
  convex.mutation(api.db.upsertClinicalRecord, h).then(() => {
    showToast("ER Handover complete.");
    window.renderEmergencyHandover();
  });
};

// --- ICU MODULE ---
window.renderIcuOverview = function() {
  const container = document.getElementById('icu-overview');
  if (!container) return;
  
  const admissions = STATE.icuAdmissions || [];
  let bedCards = '';
  
  for(let i=1; i<=8; i++) {
    const bedName = `ICU-Bed ${i}`;
    const adm = admissions.find(a => a.bedNumber === bedName && a.acuityLevel !== 'Discharged');
    
    let stateClass = 'stable';
    let occupantName = 'Available';
    let diagnosis = 'None';
    let detailsHtml = '';
    
    if (adm) {
      const p = STATE.patients.find(pt => pt.id === adm.patientId);
      occupantName = p ? p.name : 'Unknown';
      diagnosis = adm.diagnosis;
      stateClass = adm.acuityLevel.toLowerCase(); // critical, stable, improving
      
      detailsHtml = `
        <div class="icu-vitals-spark">
          <span class="spark-val ${adm.ewsScore >= 5 ? 'critical' : ''}">EWS: ${adm.ewsScore}</span>
          <span>${adm.ventilatorStatus ? '💨 VENTILATOR' : 'O2 Support'}</span>
        </div>
        <div style="margin-top:8px;">
          <button class="glass-btn glass-btn-primary" style="padding:2px 6px; font-size:0.65rem;" onclick="viewIcuPatient('${adm.patientId}')">Monitor</button>
        </div>
      `;
    }
    
    bedCards += `
      <div class="icu-bed-card ${stateClass}">
        <strong>${bedName}</strong>
        <div style="font-weight:600; font-size:0.8rem; margin-top:4px;">${occupantName}</div>
        <div style="font-size:0.7rem; color:var(--text-2); margin-top:2px;">${diagnosis}</div>
        ${detailsHtml}
      </div>
    `;
  }
  
  container.innerHTML = `
    <h3 class="form-title">ICU Live Bed Map</h3>
    <div class="icu-bed-grid" style="margin-top:15px;">
      ${bedCards}
    </div>
  `;
};

window.viewIcuPatient = function(pId) {
  // Store patient ID and route to ICU Monitor sub-panel
  STATE.selectedPatientId = pId;
  STATE.activePanel = 'icu-monitor';
  navigateToPanel('icu-monitor');
};

window.renderIcuMonitor = function() {
  const container = document.getElementById('icu-monitor');
  if (!container) return;
  
  const pId = STATE.selectedPatientId;
  if (!pId) {
    container.innerHTML = '<p style="color:var(--text-3); text-align:center; padding:40px;">Please select an ICU patient from the Bed Map first.</p>';
    return;
  }
  
  const p = STATE.patients.find(pt => pt.id === pId);
  const adm = STATE.icuAdmissions.find(a => a.patientId === pId);
  const chartings = STATE.icuCharting.filter(c => c.patientId === pId && c.type === 'Vitals');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 2fr 1fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">Live Vitals & Ventilator Parameters: ${p ? p.name : 'Unknown'}</h3>
        <div class="vitals-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:15px;">
          <div class="vital-box"><div class="vital-box-title">Heart Rate</div><div class="vital-box-value">${chartings.length > 0 ? chartings[chartings.length-1].hr : '82'}</div><div class="vital-box-unit">bpm</div></div>
          <div class="vital-box"><div class="vital-box-title">SpO2</div><div class="vital-box-value">${chartings.length > 0 ? chartings[chartings.length-1].spo2 : '96'}</div><div class="vital-box-unit">%</div></div>
          <div class="vital-box"><div class="vital-box-title">Resp Rate</div><div class="vital-box-value">${chartings.length > 0 ? chartings[chartings.length-1].rr : '18'}</div><div class="vital-box-unit">/min</div></div>
          <div class="vital-box"><div class="vital-box-title">EtCO2</div><div class="vital-box-value">${chartings.length > 0 ? chartings[chartings.length-1].etco2 : '36'}</div><div class="vital-box-unit">mmHg</div></div>
        </div>
        
        <h4 style="font-size:0.85rem; margin-bottom:10px;">Ventilator Settings</h4>
        <div style="background:var(--bg); padding:12px; border-radius:8px; display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin-bottom:15px;">
          <div><label style="font-size:0.7rem;color:var(--text-3);">Mode</label><div><strong>CMV</strong></div></div>
          <div><label style="font-size:0.7rem;color:var(--text-3);">FiO2 (%)</label><div><strong>45%</strong></div></div>
          <div><label style="font-size:0.7rem;color:var(--text-3);">PEEP</label><div><strong>5 cmH2O</strong></div></div>
          <div><label style="font-size:0.7rem;color:var(--text-3);">Tidal Volume</label><div><strong>420 ml</strong></div></div>
        </div>
        
        <form onsubmit="event.preventDefault(); saveIcuVitals('${pId}')" style="background:var(--border-light); padding:10px; border-radius:8px;">
          <h4 style="font-size:0.8rem; margin-bottom:10px;">Record Hourly ICU Vitals</h4>
          <div class="form-grid" style="grid-template-columns:repeat(4, 1fr); gap:8px;">
            <div class="form-group"><label>Heart Rate</label><input type="number" id="icu-v-hr" value="80" required></div>
            <div class="form-group"><label>SpO2 %</label><input type="number" id="icu-v-spo2" value="98" required></div>
            <div class="form-group"><label>Resp Rate</label><input type="number" id="icu-v-rr" value="16" required></div>
            <div class="form-group"><label>EtCO2</label><input type="number" id="icu-v-etco2" value="35" required></div>
          </div>
          <button class="glass-btn glass-btn-primary" type="submit" style="margin-top:10px;">Log Vitals</button>
        </form>
      </div>
      
      <div class="glass-card">
        <h3 class="form-title">Active Drips & Infusions</h3>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="background:rgba(70,15,117,0.05); padding:8px; border-radius:6px; border-left:3px solid var(--primary);">
            <strong>Noradrenaline Drip</strong><br>
            <small>Conc: 4mg in 50ml | Rate: 4 ml/hr</small>
          </div>
          <div style="background:rgba(70,15,117,0.05); padding:8px; border-radius:6px; border-left:3px solid var(--primary);">
            <strong>Fentanyl Infusion</strong><br>
            <small>Conc: 100mcg in 50ml | Rate: 2 ml/hr</small>
          </div>
        </div>
      </div>
    </div>
  `;
};

window.saveIcuVitals = function(pId) {
  const hr = parseInt(document.getElementById('icu-v-hr').value);
  const spo2 = parseInt(document.getElementById('icu-v-spo2').value);
  const rr = parseInt(document.getElementById('icu-v-rr').value);
  const etco2 = parseInt(document.getElementById('icu-v-etco2').value);
  
  const entry = {
    id: `ICU-V-${Date.now()}`,
    patientId: pId,
    type: 'Vitals',
    hr, spo2, rr, etco2,
    timestamp: new Date().toISOString(),
    recordedBy: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'ICU Nurse'
  };
  
  convex.mutation(api.db.upsertIcuCharting, entry).then(() => {
    showToast("ICU Vitals logged successfully.");
    window.renderIcuMonitor();
  });
};

window.renderIcuRounds = function() {
  const container = document.getElementById('icu-rounds');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width: 600px; margin: auto;">
      <h3 class="form-title">ICU Clinical Scoring (SOFA & APACHE II)</h3>
      <form onsubmit="event.preventDefault(); saveIcuScores()">
        <div class="form-group"><label>Select Admitted Patient *</label>
          <select id="icu-score-pat" required>
            ${STATE.icuAdmissions.map(a => `<option value="${a.patientId}">${a.bedNumber} - Patient: ${a.patientId}</option>`).join('')}
          </select>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>APACHE II Score (0 - 71)</label><input type="number" id="icu-score-apache" value="15" required></div>
          <div class="form-group"><label>SOFA Score (0 - 24)</label><input type="number" id="icu-score-sofa" value="4" required></div>
        </div>
        <div class="form-group"><label>Daily FAST HUG Checklist Compliance</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:0.8rem;">
            <label><input type="checkbox" id="fh-f" checked> F - Feeding Plan</label>
            <label><input type="checkbox" id="fh-a" checked> A - Analgesia checked</label>
            <label><input type="checkbox" id="fh-s" checked> S - Sedation vacation</label>
            <label><input type="checkbox" id="fh-t" checked> T - Thrombo prophylaxis</label>
            <label><input type="checkbox" id="fh-h" checked> H - Head elevated</label>
            <label><input type="checkbox" id="fh-u" checked> U - Ulcer prophylaxis</label>
            <label><input type="checkbox" id="fh-g" checked> G - Glucose control</label>
          </div>
        </div>
        <button class="glass-btn glass-btn-primary" type="submit">Log Daily Scoring</button>
      </form>
    </div>
  `;
};

window.saveIcuScores = function() {
  const pId = document.getElementById('icu-score-pat').value;
  const apache = parseInt(document.getElementById('icu-score-apache').value);
  const sofa = parseInt(document.getElementById('icu-score-sofa').value);
  
  const adm = STATE.icuAdmissions.find(a => a.patientId === pId);
  if (!adm) return;
  
  adm.apacheScore = apache;
  adm.sofaScore = sofa;
  adm.ewsScore = Math.floor(sofa / 2) + 2; // Derived score
  
  convex.mutation(api.db.upsertIcuAdmission, adm).then(() => {
    showToast("ICU Scores logged successfully.");
    logAudit('Edit', pId, `Logged SOFA: ${sofa}, APACHE II: ${apache}`);
    STATE.activePanel = 'icu-overview';
    navigateToPanel('icu-overview');
  });
};

window.renderIcuProcedures = function() {
  const container = document.getElementById('icu-procedures');
  if (!container) return;
  
  let logsHtml = STATE.clinicalRecords.filter(r => r.type === 'ICUProcedure').map(l => `
    <div style="background:var(--bg); border:1px solid var(--border); padding:8px; border-radius:6px; font-size:0.75rem; margin-bottom:8px;">
      <div class="flex-between"><strong>${l.procedureName}</strong> <span>${new Date(l.timestamp).toLocaleDateString()}</span></div>
      <div>Patient: ${l.patientId} | Performed by: ${l.doctorName}</div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1.2fr 2fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">Log Critical Care Procedure</h3>
        <form onsubmit="event.preventDefault(); saveIcuProcedure()">
          <div class="form-group"><label>Patient ID *</label>
            <select id="icu-proc-pat" required>
              ${STATE.icuAdmissions.map(a => `<option value="${a.patientId}">${a.bedNumber} - Patient: ${a.patientId}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Procedure *</label>
            <select id="icu-proc-name" required>
              <option>Central Venous Line Insertion</option>
              <option>Endotracheal Intubation</option>
              <option>Arterial Line Cannulation</option>
              <option>Urinary Catheterization</option>
              <option>Thoracocentesis</option>
            </select>
          </div>
          <button class="glass-btn glass-btn-primary" type="submit">Submit Procedure Entry</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">Procedures Log Book</h3>
        <div style="max-height:300px; overflow-y:auto;">
          ${logsHtml || '<p style="color:var(--text-3); text-align:center;">No procedures logged yet.</p>'}
        </div>
      </div>
    </div>
  `;
};

window.saveIcuProcedure = function() {
  const pId = document.getElementById('icu-proc-pat').value;
  const proc = document.getElementById('icu-proc-name').value;
  
  const rec = {
    id: `PROC-${Date.now()}`,
    patientId: pId,
    type: 'ICUProcedure',
    procedureName: proc,
    timestamp: new Date().toISOString(),
    doctorName: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'ICU Specialist'
  };
  
  convex.mutation(api.db.upsertClinicalRecord, rec).then(() => {
    showToast(`Procedure recorded: ${proc}`);
    logAudit('Create', rec.id, `Logged ICU procedure ${proc} for patient ${pId}`);
    window.renderIcuProcedures();
  });
};

window.renderIcuAlerts = function() {
  const container = document.getElementById('icu-alerts');
  if (!container) return;
  
  const criticals = STATE.icuAdmissions.filter(a => a.ewsScore >= 5);
  let list = criticals.map(c => `
    <div class="glass-card" style="border-left:5px solid var(--danger); margin-bottom:10px;">
      <div class="flex-between"><strong>Bed: ${c.bedNumber}</strong> <span class="status-indicator status-canceled">HIGH RISK</span></div>
      <div style="font-size:0.8rem; margin-top:4px;">Patient ID: ${c.patientId} | EWS Score: ${c.ewsScore}</div>
      <div style="font-size:0.75rem; color:var(--text-2);">Auto-triggered Warning: Physiological deterioration imminent. Check vitals immediately.</div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Active ICU Early Warning System (EWS) Alerts</h3>
    <div style="margin-top:15px;">
      ${list || '<p style="color:var(--success); font-weight:600; text-align:center; padding:30px;">✓ All patients physiologically stable.</p>'}
    </div>
  `;
};

// --- OT / SURGERY ---
window.renderOtSchedule = function() {
  const container = document.getElementById('ot-schedule');
  if (!container) return;
  
  const rooms = ['OT-1', 'OT-2', 'OT-3'];
  let roomRows = '';
  
  rooms.forEach(room => {
    const list = STATE.surgeries.filter(s => s.roomNumber === room && s.status !== 'Completed');
    let blocks = list.map(s => {
      const p = STATE.patients.find(pt => pt.id === s.patientId);
      const name = p ? p.name : 'Unknown';
      return `
        <div class="ot-schedule-block">
          <strong>${s.scheduledTime}</strong>: ${s.procedureName} (${name})
          <div style="margin-top:4px;">
            <button class="glass-btn glass-btn-primary" style="padding:1px 4px; font-size:0.6rem;" onclick="openIntraOpRecord('${s.id}')">Operate</button>
            <button class="glass-btn glass-btn-secondary" style="padding:1px 4px; font-size:0.6rem;" onclick="completeSurgery('${s.id}')">Complete</button>
          </div>
        </div>
      `;
    }).join('');
    
    roomRows += `
      <div class="ot-room-row">
        <div class="ot-room-label">${room}</div>
        <div class="ot-room-schedule">${blocks || '<div style="font-size:0.75rem; color:var(--text-3); display:flex; align-items:center;">Empty</div>'}</div>
      </div>
    `;
  });
  
  container.innerHTML = `
    <h3 class="form-title">OT Rooms Live Scheduler</h3>
    <div class="ot-gantt-container">${roomRows}</div>
  `;
};

window.openIntraOpRecord = function(sId) {
  STATE.selectedPatientId = sId;
  STATE.activePanel = 'ot-intra';
  navigateToPanel('ot-intra');
};

window.completeSurgery = function(sId) {
  const s = STATE.surgeries.find(su => su.id === sId);
  if (!s) return;
  
  s.status = 'Completed';
  const pat = STATE.patients.find(p => p.id === s.patientId);
  if (pat) {
    pat.status = 'Post-Op Recovery';
  }
  
  Promise.all([
    convex.mutation(api.db.upsertSurgery, s),
    pat ? mutatePatient(pat) : Promise.resolve()
  ]).then(() => {
    showToast("Surgery marked completed. Patient transferred to Recovery Room.");
    logAudit('Edit', sId, `Completed surgical case: ${s.procedureName}`);
    window.renderOtSchedule();
  });
};

window.renderOtBooking = function() {
  const container = document.getElementById('ot-booking');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Book Surgical Operation</h3>
      <form onsubmit="event.preventDefault(); saveSurgeryBooking()">
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>Patient ID *</label><input type="text" id="ot-b-pat" placeholder="AURA-2026-0001" required></div>
          <div class="form-group"><label>OT Room *</label><select id="ot-b-room"><option>OT-1</option><option>OT-2</option><option>OT-3</option></select></div>
        </div>
        <div class="form-group"><label>Procedure Name *</label><input type="text" id="ot-b-proc" placeholder="Laparoscopic Appendectomy" required></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>Surgeon *</label>
            <select id="ot-b-surgeon">
              ${DOCTORS.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Anesthesiologist *</label>
            <select id="ot-b-anest">
              ${DOCTORS.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-grid" style="grid-template-columns:1.2fr 1fr; gap:10px;">
          <div class="form-group"><label>Scheduled Date</label><input type="date" id="ot-b-date" value="${new Date().toISOString().split('T')[0]}" required></div>
          <div class="form-group"><label>Scheduled Time</label><input type="time" id="ot-b-time" value="09:00" required></div>
        </div>
        <button class="glass-btn glass-btn-primary" type="submit" style="width:100%; margin-top:10px;">Schedule Surgery</button>
      </form>
    </div>
  `;
};

window.saveSurgeryBooking = function() {
  const pId = document.getElementById('ot-b-pat').value.trim();
  const room = document.getElementById('ot-b-room').value;
  const proc = document.getElementById('ot-b-proc').value.trim();
  const surgeon = document.getElementById('ot-b-surgeon').value;
  const anest = document.getElementById('ot-b-anest').value;
  const date = document.getElementById('ot-b-date').value;
  const time = document.getElementById('ot-b-time').value;
  
  const pat = STATE.patients.find(pt => pt.id === pId);
  if (!pat) {
    showToast("Invalid Patient ID", "error");
    return;
  }
  
  const sId = `SURG-${Date.now().toString().slice(-4)}`;
  const newSurgery = {
    id: sId,
    patientId: pId,
    procedureName: proc,
    surgeonId: surgeon,
    anesthetistId: anest,
    roomNumber: room,
    scheduledDate: date,
    scheduledTime: time,
    status: 'Scheduled',
    preOpChecklist: { identityConfirmed: true, siteMarked: true, consentSigned: true }
  };
  
  convex.mutation(api.db.upsertSurgery, newSurgery).then(() => {
    showToast(`Surgery scheduled: ${sId}`);
    logAudit('Create', sId, `Scheduled procedure ${proc} in ${room}`);
    STATE.activePanel = 'ot-schedule';
    navigateToPanel('ot-schedule');
  }).catch(err => showToast(err.message, 'error'));
};

window.renderOtChecklist = function() {
  const container = document.getElementById('ot-checklist');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">WHO Surgical Safety Checklist</h3>
      <form onsubmit="event.preventDefault(); saveOtSafetyChecklist()">
        <div class="form-group"><label>Select Scheduled Surgery Case *</label>
          <select id="ot-safe-surg" required>
            ${STATE.surgeries.filter(s => s.status === 'Scheduled').map(s => `<option value="${s.id}">${s.procedureName} - Patient: ${s.patientId}</option>`).join('')}
          </select>
        </div>
        
        <h4 style="margin-top:10px; margin-bottom:6px; font-size:0.8rem;">1. Sign In (Before induction of anesthesia)</h4>
        <div style="font-size:0.78rem; display:flex; flex-direction:column; gap:4px;">
          <label><input type="checkbox" id="sc-identity" checked> Patient identity, surgical site, and consent confirmed</label>
          <label><input type="checkbox" id="sc-site"> Surgical site marked</label>
          <label><input type="checkbox" id="sc-anesthesia"> Anesthesia safety check completed</label>
          <label><input type="checkbox" id="sc-pulse"> Pulse oximeter active and functioning</label>
        </div>
        
        <h4 style="margin-top:10px; margin-bottom:6px; font-size:0.8rem;">2. Time Out (Before skin incision)</h4>
        <div style="font-size:0.78rem; display:flex; flex-direction:column; gap:4px;">
          <label><input type="checkbox" id="sc-intro"> Team members introduced by name & role</label>
          <label><input type="checkbox" id="sc-confirm"> Surgeon, Anesthetist & Nurse confirm patient, site, and procedure</label>
          <label><input type="checkbox" id="sc-prophyl"> Antibiotic prophylaxis given within 60 mins</label>
        </div>
        
        <button class="glass-btn glass-btn-primary" type="submit" style="width:100%; margin-top:12px;">Digitally Sign Checklist</button>
      </form>
    </div>
  `;
};

window.saveOtSafetyChecklist = function() {
  const sId = document.getElementById('ot-safe-surg').value;
  const s = STATE.surgeries.find(su => su.id === sId);
  if (!s) return;
  
  s.preOpChecklist = {
    identityConfirmed: document.getElementById('sc-identity').checked,
    siteMarked: document.getElementById('sc-site').checked,
    anesthesiaSafetyChecked: document.getElementById('sc-anesthesia').checked,
    pulseOximeterActive: document.getElementById('sc-pulse').checked,
    teamIntroduced: document.getElementById('sc-intro').checked,
    procedureConfirmed: document.getElementById('sc-confirm').checked,
    antibioticsGiven: document.getElementById('sc-prophyl').checked,
    signedBy: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'Chief Surgeon',
    timestamp: new Date().toISOString()
  };
  
  s.status = 'In-Progress';
  
  convex.mutation(api.db.upsertSurgery, s).then(() => {
    showToast("WHO Surgical Checklist Signed. Surgery initiated!");
    logAudit('Edit', sId, `Signed WHO Surgical Safety Checklist`);
    STATE.activePanel = 'ot-schedule';
    navigateToPanel('ot-schedule');
  });
};

window.renderOtPac = function() {
  const container = document.getElementById('ot-pac');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Pre-Anesthesia Checkup (PAC)</h3>
      <form onsubmit="event.preventDefault(); savePAC()">
        <div class="form-group"><label>Select Patient ID *</label>
          <select id="pac-pat-id" required>
            ${STATE.patients.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('')}
          </select>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>ASA Grading (I - VI) *</label><select id="pac-asa"><option>ASA I</option><option>ASA II</option><option>ASA III</option><option>ASA IV</option></select></div>
          <div class="form-group"><label>Mallampati Score (1 - 4) *</label><select id="pac-mall"><option>Class 1</option><option>Class 2</option><option>Class 3</option><option>Class 4</option></select></div>
        </div>
        <div class="form-group"><label>Cardiac / Respiratory Evaluation</label><input type="text" id="pac-cardiac" value="Normal S1 S2. Chest clear."></div>
        <div class="form-group"><label>Anesthesia Plan / Special Concerns</label><input type="text" id="pac-anest-plan" value="General Anesthesia with Intubation. No active allergies."></div>
        <button class="glass-btn glass-btn-primary" type="submit">Save PAC Form</button>
      </form>
    </div>
  `;
};

window.savePAC = function() {
  const pId = document.getElementById('pac-pat-id').value;
  const asa = document.getElementById('pac-asa').value;
  const mallampati = document.getElementById('pac-mall').value;
  const evaluation = document.getElementById('pac-cardiac').value;
  const plan = document.getElementById('pac-anest-plan').value;
  
  const pac = {
    id: `PAC-${Date.now()}`,
    patientId: pId,
    type: 'PAC',
    asa, mallampati, evaluation, plan,
    timestamp: new Date().toISOString(),
    anesthetistName: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'Dr. Ananya Sharma'
  };
  
  convex.mutation(api.db.upsertClinicalRecord, pac).then(() => {
    showToast("PAC Record saved successfully.");
    logAudit('Create', pac.id, `Recorded PAC for patient ${pId}`);
    STATE.activePanel = 'ot-schedule';
    navigateToPanel('ot-schedule');
  });
};

window.renderOtIntra = function() {
  const container = document.getElementById('ot-intra');
  if (!container) return;
  
  const sId = STATE.selectedPatientId;
  const surg = STATE.surgeries.find(s => s.id === sId);
  
  if (!surg) {
    container.innerHTML = '<p style="color:var(--text-3); text-align:center; padding:40px;">Please click "Operate" on an active surgery from the OT Schedule Board.</p>';
    return;
  }
  
  const p = STATE.patients.find(pt => pt.id === surg.patientId);
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Intra-Operative Record: Case ${surg.id}</h3>
      <div style="font-size:0.8rem; color:var(--text-2); margin-bottom:12px;">
        Procedure: ${surg.procedureName} | Patient: ${p ? p.name : surg.patientId}
      </div>
      <form onsubmit="event.preventDefault(); saveIntraOp()">
        <div class="form-group"><label>Intra-Op Surgical Findings</label><textarea id="io-findings" placeholder="Describe anatomy, pathology, and actions..." required></textarea></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>Estimated Blood Loss (ml)</label><input type="number" id="io-blood-loss" value="150"></div>
          <div class="form-group"><label>Implants / Prosthesis Used</label><input type="text" id="io-implants" placeholder="Titanium plate, mesh, none"></div>
        </div>
        <button class="glass-btn glass-btn-primary" type="submit">Save Intra-Op Record</button>
      </form>
    </div>
  `;
};

window.saveIntraOp = function() {
  const sId = STATE.selectedPatientId;
  const surg = STATE.surgeries.find(s => s.id === sId);
  if (!surg) return;
  
  const findings = document.getElementById('io-findings').value;
  const bloodLoss = parseInt(document.getElementById('io-blood-loss').value) || 0;
  const implants = document.getElementById('io-implants').value;
  
  surg.intraOpRecord = {
    findings,
    bloodLoss,
    implants,
    recordedBy: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'Dr. Vikranth Reddy',
    timestamp: new Date().toISOString()
  };
  
  convex.mutation(api.db.upsertSurgery, surg).then(() => {
    showToast("Intra-Operative record saved successfully.");
    logAudit('Edit', sId, `Recorded intra-op findings for case ${sId}`);
    STATE.activePanel = 'ot-schedule';
    navigateToPanel('ot-schedule');
  });
};

window.renderOtRecovery = function() {
  const container = document.getElementById('ot-recovery');
  if (!container) return;
  
  const postOps = STATE.surgeries.filter(s => s.status === 'Completed' && (!s.postOpRecovery || s.postOpRecovery.destination !== 'Discharged'));
  
  let cards = postOps.map(s => {
    const p = STATE.patients.find(pt => pt.id === s.patientId);
    const score = s.postOpRecovery ? s.postOpRecovery.aldreteScore : 8;
    return `
      <div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:10px;">
        <div class="flex-between"><strong>Patient: ${p ? p.name : s.patientId}</strong> <span>Score: ${score}/10</span></div>
        <div style="font-size:0.75rem; color:var(--text-2); margin-top:4px;">Procedure: ${s.procedureName}</div>
        <div style="margin-top:8px; display:flex; gap:6px;">
          <button class="glass-btn glass-btn-primary" style="padding:2px 6px; font-size:0.7rem;" onclick="releaseFromRecovery('${s.id}', 'Ward')">Send to Ward</button>
          <button class="glass-btn glass-btn-secondary" style="padding:2px 6px; font-size:0.7rem;" onclick="releaseFromRecovery('${s.id}', 'ICU')">Send to ICU</button>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Post-Op Recovery Room (PACU)</h3>
    <div style="max-height: 400px; overflow-y: auto; margin-top:12px;">
      ${cards || '<p style="color:var(--text-3); text-align:center;">No patients currently in PACU recovery.</p>'}
    </div>
  `;
};

window.releaseFromRecovery = function(sId, dest) {
  const s = STATE.surgeries.find(su => su.id === sId);
  if (!s) return;
  
  s.postOpRecovery = {
    aldreteScore: 9,
    painScore: 2,
    destination: dest,
    releasedBy: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'Recovery Nurse',
    timestamp: new Date().toISOString()
  };
  
  const pat = STATE.patients.find(p => p.id === s.patientId);
  if (pat) {
    pat.bedAssignment = dest === 'ICU' ? 'ICU-Bed 1' : 'Bed 1';
    pat.status = 'Admitted';
  }
  
  Promise.all([
    convex.mutation(api.db.upsertSurgery, s),
    pat ? mutatePatient(pat) : Promise.resolve()
  ]).then(() => {
    showToast(`Released patient to ${dest}`);
    logAudit('Edit', s.patientId, `Transferred post-op patient to ${dest}`);
    window.renderOtRecovery();
  });
};

window.renderOtAnalytics = function() {
  const container = document.getElementById('ot-analytics');
  if (!container) return;
  
  const total = STATE.surgeries.length;
  const completed = STATE.surgeries.filter(s => s.status === 'Completed').length;
  const inProgress = STATE.surgeries.filter(s => s.status === 'In-Progress').length;
  const utilization = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  container.innerHTML = `
    <h3 class="form-title">OT Room Utilization & Performance</h3>
    <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); margin-top:15px;">
      <div class="glass-card stat-card">
        <div class="stat-details"><span class="stat-label">Total Procedures</span><span class="stat-val">${total}</span></div>
      </div>
      <div class="glass-card stat-card">
        <div class="stat-details"><span class="stat-label">Completed Cases</span><span class="stat-val">${completed}</span></div>
      </div>
      <div class="glass-card stat-card">
        <div class="stat-details"><span class="stat-label">OT Utilization Rate</span><span class="stat-val">${utilization}%</span></div>
      </div>
    </div>
  `;
};

// --- BLOOD BANK ---
window.renderBloodStock = function() {
  const container = document.getElementById('bloodbank-stock');
  if (!container) return;
  
  const stock = STATE.bloodInventory || [];
  let cardsHtml = stock.map(s => {
    const isLow = s.units < 5;
    return `
      <div class="blood-group-card ${isLow ? 'blood-stock-low' : ''}">
        <div class="blood-group-title">${s.bloodGroup}</div>
        <div style="font-size:0.75rem; color:var(--text-3); font-weight:600;">${s.component}</div>
        <div class="blood-units-count">${s.units} Units</div>
        <span style="font-size:0.65rem; color:var(--text-3);">Exp: ${new Date(s.expiry).toLocaleDateString()}</span>
      </div>
    `;
  }).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Blood Group Component Inventory</h3>
    <div class="blood-stock-grid" style="margin-top:15px;">
      ${cardsHtml || '<p style="color:var(--text-3)">No stock record loaded.</p>'}
    </div>
  `;
};

window.renderBloodDonor = function() {
  const container = document.getElementById('bloodbank-donor');
  if (!container) return;
  
  let donors = STATE.donors || [];
  let rows = donors.map(d => `
    <tr>
      <td>${d.id}</td>
      <td class="text-bold">${d.name}</td>
      <td>${d.bloodGroup}</td>
      <td>${d.mobile}</td>
      <td>${new Date(d.donationDate).toLocaleDateString()}</td>
      <td><span class="status-indicator status-done">${d.eligibility}</span></td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1.2fr 2fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">Register Blood Donor</h3>
        <form onsubmit="event.preventDefault(); saveDonor()">
          <div class="form-group"><label>Full Name *</label><input type="text" id="donor-name" required placeholder="Kumar Mangalam"></div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group"><label>Age *</label><input type="number" id="donor-age" required placeholder="25"></div>
            <div class="form-group"><label>Blood Group *</label><select id="donor-blood" required><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>O+</option><option>O-</option><option>AB+</option><option>AB-</option></select></div>
          </div>
          <div class="form-group"><label>Mobile Phone *</label><input type="tel" id="donor-phone" required placeholder="9876543210"></div>
          <button class="glass-btn glass-btn-primary" type="submit">Verify & Register Donor</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">Donor Registry</h3>
        <div class="table-wrapper">
          <table class="ehr-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Group</th><th>Mobile</th><th>Reg Date</th><th>Status</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No donors registered.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
};

window.saveDonor = function() {
  const name = document.getElementById('donor-name').value;
  const age = document.getElementById('donor-age').value;
  const bloodGroup = document.getElementById('donor-blood').value;
  const mobile = document.getElementById('donor-phone').value;
  
  const dId = `DON-${Date.now().toString().slice(-4)}`;
  const newDonor = {
    id: dId,
    name, age: parseInt(age), bloodGroup, mobile,
    donationDate: new Date().toISOString(),
    eligibility: 'Eligible'
  };
  
  convex.mutation(api.db.upsertDonor, newDonor).then(() => {
    showToast(`Donor registered: ${dId}`);
    window.renderBloodDonor();
  });
};

window.renderBloodDonation = function() {
  const container = document.getElementById('bloodbank-donation');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Blood Bag Collection Logger</h3>
      <form onsubmit="event.preventDefault(); saveDonationBag()">
        <div class="form-group"><label>Select Registered Donor *</label>
          <select id="bag-donor-select" required>
            ${(STATE.donors || []).map(d => `<option value="${d.id}">${d.name} (${d.bloodGroup})</option>`).join('')}
          </select>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>Bag ID *</label><input type="text" id="bag-id" placeholder="BAG-1082" required></div>
          <div class="form-group"><label>Component Separation *</label>
            <select id="bag-component" required>
              <option>Whole Blood</option>
              <option>PRBC</option>
              <option>FFP</option>
              <option>Platelets</option>
            </select>
          </div>
        </div>
        <button class="glass-btn glass-btn-primary" type="submit" style="width:100%; margin-top:10px;">Log Collection Bag</button>
      </form>
    </div>
  `;
};

window.saveDonationBag = function() {
  const donorId = document.getElementById('bag-donor-select').value;
  const bagId = document.getElementById('bag-id').value.trim();
  const component = document.getElementById('bag-component').value;
  
  const donor = STATE.donors.find(d => d.id === donorId);
  if (!donor) return;
  
  const newStock = {
    id: `BLD-${bagId}`,
    bloodGroup: donor.bloodGroup,
    component,
    units: 1,
    expiry: new Date(Date.now() + 35*24*3600*1000).toISOString().split('T')[0]
  };
  
  convex.mutation(api.db.upsertBloodInventory, newStock).then(() => {
    showToast(`Logged blood bag units: ${bagId}`);
    logAudit('Create', newStock.id, `Collected blood component ${component} from donor ${donorId}`);
    STATE.activePanel = 'bloodbank-stock';
    navigateToPanel('bloodbank-stock');
  });
};

window.renderBloodCrossMatch = function() {
  const container = document.getElementById('bloodbank-crossmatch');
  if (!container) return;
  
  const requests = STATE.bloodRequests || [];
  let rows = requests.map(r => `
    <tr>
      <td>${r.id}</td>
      <td><code>${r.patientId}</code></td>
      <td>${r.bloodGroup}</td>
      <td>${r.units} Units</td>
      <td><span class="status-indicator status-pending">${r.status}</span></td>
      <td>
        <button class="glass-btn glass-btn-success" style="padding:2px 6px; font-size:0.7rem;" onclick="approveCrossMatch('${r.id}')">Approve Cross</button>
      </td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Active Blood Cross-Match Requests</h3>
    <div class="table-wrapper" style="margin-top:12px;">
      <table class="ehr-table">
        <thead>
          <tr><th>Request ID</th><th>Patient</th><th>Blood Group</th><th>Requested</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No active requests.</td></tr>'}</tbody>
      </table>
    </div>
  `;
};

window.approveCrossMatch = function(reqId) {
  const r = STATE.bloodRequests.find(rq => rq.id === reqId);
  if (!r) return;
  
  r.status = 'Approved / Matched';
  convex.mutation(api.db.upsertBloodRequest, r).then(() => {
    showToast(`Cross-Match approved for Request: ${reqId}`);
    window.renderBloodCrossMatch();
  });
};

window.renderBloodIssue = function() {
  const container = document.getElementById('bloodbank-issue');
  if (!container) return;
  
  const approved = (STATE.bloodRequests || []).filter(r => r.status === 'Approved / Matched');
  let cards = approved.map(r => `
    <div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.75rem;">
      <div class="flex-between"><strong>Request: ${r.id}</strong> <span>Group: ${r.bloodGroup}</span></div>
      <div style="margin-top:4px;">Patient ID: ${r.patientId} | Units: ${r.units}</div>
      <button class="glass-btn glass-btn-primary" style="margin-top:8px; padding:2px 6px; font-size:0.7rem;" onclick="issueBloodBag('${r.id}')">Issue Blood Units</button>
    </div>
  `).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1fr 1fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">Transfusion Reaction Log</h3>
        <form onsubmit="event.preventDefault(); saveTransfusionReaction()">
          <div class="form-group"><label>Patient ID *</label><input type="text" id="tr-pat-id" placeholder="AURA-2026-0001" required></div>
          <div class="form-group"><label>Reaction Classification *</label><select id="tr-class"><option>Febrile Non-Hemolytic</option><option>Acute Hemolytic Reaction</option><option>Allergic / Anaphylactic</option></select></div>
          <div class="form-group"><label>Severity Grading *</label><select id="tr-severity"><option>Mild</option><option>Moderate</option><option>Severe / Critical</option></select></div>
          <button class="glass-btn glass-btn-danger" type="submit">Log Adverse Reaction</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">Issue Blood Component</h3>
        <div style="max-height:350px; overflow-y:auto;">
          ${cards || '<p style="color:var(--text-3); text-align:center;">No pending matched requests for issue.</p>'}
        </div>
      </div>
    </div>
  `;
};

window.issueBloodBag = function(reqId) {
  const r = STATE.bloodRequests.find(rq => rq.id === reqId);
  if (!r) return;
  
  r.status = 'Issued';
  
  const inventoryMatch = STATE.bloodInventory.find(bi => bi.bloodGroup === r.bloodGroup);
  if (inventoryMatch && inventoryMatch.units >= r.units) {
    inventoryMatch.units -= r.units;
  }
  
  Promise.all([
    convex.mutation(api.db.upsertBloodRequest, r),
    inventoryMatch ? convex.mutation(api.db.upsertBloodInventory, inventoryMatch) : Promise.resolve()
  ]).then(() => {
    showToast(`Blood units successfully issued to Ward for Request: ${reqId}`);
    logAudit('Edit', reqId, `Issued ${r.units} units of ${r.bloodGroup} blood`);
    window.renderBloodIssue();
  });
};

window.saveTransfusionReaction = function() {
  const pId = document.getElementById('tr-pat-id').value.trim();
  const reaction = document.getElementById('tr-class').value;
  const severity = document.getElementById('tr-severity').value;
  
  const log = {
    id: `REAC-${Date.now()}`,
    patientId: pId,
    type: 'TransfusionReaction',
    reaction, severity,
    timestamp: new Date().toISOString(),
    recordedBy: STATE.currentUserProfile ? STATE.currentUserProfile.name : 'Ward Nurse'
  };
  
  convex.mutation(api.db.upsertClinicalRecord, log).then(() => {
    showToast("Adverse reaction logged. Warnings broadcasted to Nurse station.", "error");
    logAudit('Create', log.id, `CRITICAL: Transfusion reaction logged for patient ${pId}`);
    document.getElementById('tr-pat-id').value = '';
  });
};

// --- DIET & NUTRITION ---
window.renderDietKitchen = function() {
  const container = document.getElementById('diet-kitchen');
  if (!container) return;
  
  const orders = STATE.dietOrders || [];
  let summary = { Regular: 0, Diabetic: 0, Renal: 0, Soft: 0, Liquid: 0, NBM: 0 };
  
  orders.forEach(o => {
    if (o.dietType.toLowerCase().includes('regular')) summary.Regular++;
    else if (o.dietType.toLowerCase().includes('diabetic')) summary.Diabetic++;
    else if (o.dietType.toLowerCase().includes('renal')) summary.Renal++;
    else if (o.dietType.toLowerCase().includes('soft')) summary.Soft++;
    else if (o.dietType.toLowerCase().includes('liquid')) summary.Liquid++;
    else if (o.dietType.toLowerCase().includes('nbm')) summary.NBM++;
  });
  
  container.innerHTML = `
    <h3 class="form-title">Kitchen Dietary Preparation Board</h3>
    <div class="stats-grid" style="grid-template-columns: repeat(6, 1fr); margin-top:15px; margin-bottom:16px;">
      ${Object.keys(summary).map(key => `
        <div class="glass-card" style="padding:10px; text-align:center;">
          <strong>${key}</strong>
          <div style="font-size:1.5rem; font-weight:700; color:var(--primary); margin-top:4px;">${summary[key]}</div>
        </div>
      `).join('')}
    </div>
  `;
};

window.renderDietOrders = function() {
  const container = document.getElementById('diet-orders');
  if (!container) return;
  
  const list = STATE.dietOrders || [];
  let rows = list.map(o => `
    <tr>
      <td><code>${o.patientId}</code></td>
      <td class="text-bold">${o.dietType}</td>
      <td>${o.preference}</td>
      <td>${o.allergens.join(', ') || 'None'}</td>
      <td><span class="status-indicator status-active">${o.breakfast || 'Pending'}</span></td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1.2fr 2fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">Record Dietary Care Plan</h3>
        <form onsubmit="event.preventDefault(); saveDietOrder()">
          <div class="form-group"><label>Patient ID *</label><input type="text" id="diet-pat" placeholder="AURA-2026-0001" required></div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group"><label>Dietary Regime *</label>
              <select id="diet-regime" required>
                <option>Regular Standard</option>
                <option>Cardiac / Low Sodium</option>
                <option>Diabetic Carbohydrate Restricted</option>
                <option>Renal Protein Restricted</option>
                <option>Clear Liquid</option>
                <option>NBM (Fasting)</option>
              </select>
            </div>
            <div class="form-group"><label>Veg / Non-Veg Preferences</label><select id="diet-pref"><option>Veg</option><option>Non-Veg</option><option>Egg</option></select></div>
          </div>
          <div class="form-group"><label>Allergen Locks (Comma separated)</label><input type="text" id="diet-allergens" placeholder="Nuts, Gluten, Shellfish"></div>
          <button class="glass-btn glass-btn-primary" type="submit">Deploy Diet Plan</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">Active Dietary Roster</h3>
        <div class="table-wrapper">
          <table class="ehr-table">
            <thead>
              <tr><th>Patient ID</th><th>Diet Regime</th><th>Pref</th><th>Allergen Lock</th><th>Status</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">No active diet schedules.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
};

window.saveDietOrder = function() {
  const pId = document.getElementById('diet-pat').value.trim();
  const regime = document.getElementById('diet-regime').value;
  const pref = document.getElementById('diet-pref').value;
  const allergens = document.getElementById('diet-allergens').value.split(',').map(s=>s.trim()).filter(Boolean);
  
  const pat = STATE.patients.find(pt => pt.id === pId);
  if (!pat) {
    showToast("Invalid Patient ID", "error");
    return;
  }
  
  const newOrder = {
    id: `DIET-${Date.now()}`,
    patientId: pId,
    dietType: regime,
    preference: pref,
    allergens,
    breakfast: 'Prepared',
    lunch: 'Pending',
    dinner: 'Pending'
  };
  
  convex.mutation(api.db.upsertDietOrder, newOrder).then(() => {
    showToast("Diet Order deployed successfully.");
    window.renderDietOrders();
  });
};

window.renderDietScreening = function() {
  const container = document.getElementById('diet-screening');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Nutritional Risk Screening (NRS-2002)</h3>
      <form onsubmit="event.preventDefault(); saveNutritionalScreening()">
        <div class="form-group"><label>Patient ID *</label><input type="text" id="nrs-pat" placeholder="AURA-2026-0001" required></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>Nutritional Condition Score (0 - 3)</label><input type="number" id="nrs-nutr" value="1" min="0" max="3" required></div>
          <div class="form-group"><label>Severity of Disease Score (0 - 3)</label><input type="number" id="nrs-sev" value="1" min="0" max="3" required></div>
        </div>
        <div class="form-group"><label>Age Correction Check</label><label><input type="checkbox" id="nrs-age"> Patient Age >= 70 (+1 Point)</label></div>
        <button class="glass-btn glass-btn-primary" type="submit" style="width:100%;">Calculate Screening Score</button>
      </form>
    </div>
  `;
};

window.saveNutritionalScreening = function() {
  const pId = document.getElementById('nrs-pat').value.trim();
  const nutr = parseInt(document.getElementById('nrs-nutr').value);
  const sev = parseInt(document.getElementById('nrs-sev').value);
  const ageBonus = document.getElementById('nrs-age').checked ? 1 : 0;
  
  const pat = STATE.patients.find(pt => pt.id === pId);
  if (!pat) {
    showToast("Invalid Patient ID", "error");
    return;
  }
  
  const score = nutr + sev + ageBonus;
  const risk = score >= 3 ? 'At Nutritional Risk - Dietitian consult recommended' : 'Stable';
  
  showToast(`NRS Score: ${score}/7. Status: ${risk}`, score >= 3 ? 'warning' : 'success');
  logAudit('Create', pId, `Conducted NRS Screening for ${pId}: Score ${score}`);
};

window.renderDietTracker = function() {
  const container = document.getElementById('diet-tracker');
  if (!container) return;
  
  const list = STATE.dietOrders || [];
  let cards = list.map(o => `
    <div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.75rem;">
      <div class="flex-between"><strong>Patient: ${o.patientId}</strong> <span>Regime: ${o.dietType}</span></div>
      <div style="margin-top:6px; display:flex; gap:10px;">
        <span>Breakfast: <strong>${o.breakfast || 'Pending'}</strong></span>
        <span>Lunch: <strong>${o.lunch || 'Pending'}</strong></span>
        <span>Dinner: <strong>${o.dinner || 'Pending'}</strong></span>
      </div>
      <div style="margin-top:6px; display:flex; gap:6px;">
        <button class="glass-btn glass-btn-primary" style="padding:2px 6px; font-size:0.7rem;" onclick="updateMealStatus('${o.id}', 'breakfast', 'Delivered')">Deliver Breakfast</button>
        <button class="glass-btn glass-btn-secondary" style="padding:2px 6px; font-size:0.7rem;" onclick="updateMealStatus('${o.id}', 'lunch', 'Delivered')">Deliver Lunch</button>
        <button class="glass-btn glass-btn-secondary" style="padding:2px 6px; font-size:0.7rem;" onclick="updateMealStatus('${o.id}', 'dinner', 'Delivered')">Deliver Dinner</button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Kitchen Meal Distribution Tracker</h3>
    <div style="max-height:400px; overflow-y:auto; margin-top:12px;">
      ${cards || '<p style="color:var(--text-3); text-align:center;">No diet rosters deployed.</p>'}
    </div>
  `;
};

window.updateMealStatus = function(orderId, meal, status) {
  const o = STATE.dietOrders.find(ord => ord.id === orderId);
  if (!o) return;
  o[meal] = status;
  
  convex.mutation(api.db.upsertDietOrder, o).then(() => {
    showToast(`Meal distribution logged: ${meal} ${status}`);
    window.renderDietTracker();
  });
};

// --- AMBULANCE & FLEET LOGISTICS ---
window.renderTransportDispatch = function() {
  const container = document.getElementById('transport-dispatch');
  if (!container) return;
  
  const dispatchList = STATE.ambulanceTrips || [];
  let cards = dispatchList.map(t => `
    <div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.75rem;">
      <div class="flex-between"><strong>Trip: ${t.id} (${t.vehicleId})</strong> <span class="status-indicator status-pending">${t.status}</span></div>
      <div style="margin-top:4px;">Caller: ${t.callerName} | Location: ${t.pickupLocation}</div>
      <div style="margin-top:4px; font-style:italic;">Complaint: ${t.chiefComplaint}</div>
      <div style="margin-top:8px;">
        <button class="glass-btn glass-btn-success" style="padding:2px 6px; font-size:0.7rem;" onclick="arriveAmbulanceScene('${t.id}')">Arrive Scene</button>
        <button class="glass-btn glass-btn-primary" style="padding:2px 6px; font-size:0.7rem;" onclick="completeAmbulanceTrip('${t.id}')">Arrival Hospital</button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1.2fr 2fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">Ambulance Dispatch Control</h3>
        <form onsubmit="event.preventDefault(); dispatchVehicle()">
          <div class="form-group"><label>Caller Name & Mobile *</label><input type="text" id="disp-caller" placeholder="Suresh Hegde" required></div>
          <div class="form-group"><label>Pickup Location *</label><input type="text" id="disp-loc" placeholder="Trinity Circle Metro" required></div>
          <div class="form-group"><label>Chief Complaint *</label><input type="text" id="disp-complaint" placeholder="RTA trauma, suspected neck injury" required></div>
          <div class="form-grid" style="grid-template-columns: 1.2fr 1fr; gap:10px;">
            <div class="form-group"><label>Assign Ambulance Fleet *</label>
              <select id="disp-vehicle" required>
                ${STATE.ambulanceFleet.filter(v => v.status === 'Available').map(v => `<option value="${v.id}">${v.id} - ${v.type} (${v.vehicleNum})</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Urgency Level *</label><select id="disp-urgency"><option>Critical</option><option>High</option><option>Routine</option></select></div>
          </div>
          <button class="glass-btn glass-btn-primary" type="submit">Dispatch Fleet Vehicle</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">Active Dispatches</h3>
        <div style="max-height:400px; overflow-y:auto;">
          ${cards || '<p style="color:var(--text-3); text-align:center;">No active dispatches.</p>'}
        </div>
      </div>
    </div>
  `;
};

window.dispatchVehicle = function() {
  const caller = document.getElementById('disp-caller').value;
  const loc = document.getElementById('disp-loc').value;
  const complaint = document.getElementById('disp-complaint').value;
  const vehicle = document.getElementById('disp-vehicle').value;
  const urgency = document.getElementById('disp-urgency').value;
  
  const tripId = `TRP-${Date.now().toString().slice(-4)}`;
  const trip = {
    id: tripId,
    vehicleId: vehicle,
    callerName: caller,
    pickupLocation: loc,
    chiefComplaint: complaint,
    urgency,
    status: 'Dispatched',
    timestamps: { callReceived: new Date().toISOString(), dispatched: new Date().toISOString() }
  };
  
  const fleetObj = STATE.ambulanceFleet.find(v => v.id === vehicle);
  if (fleetObj) {
    fleetObj.status = 'Dispatched';
  }
  
  Promise.all([
    convex.mutation(api.db.upsertAmbulanceTrip, trip),
    fleetObj ? convex.mutation(api.db.upsertAmbulanceFleet, fleetObj) : Promise.resolve()
  ]).then(() => {
    showToast(`Ambulance Dispatched: ${vehicle}`);
    logAudit('Create', tripId, `Dispatched fleet vehicle ${vehicle} for ${complaint}`);
    window.renderTransportDispatch();
  });
};

window.arriveAmbulanceScene = function(tripId) {
  const t = STATE.ambulanceTrips.find(tr => tr.id === tripId);
  if (!t) return;
  
  t.status = 'On-Scene';
  t.timestamps.reachedScene = new Date().toISOString();
  
  const f = STATE.ambulanceFleet.find(fl => fl.id === t.vehicleId);
  if (f) f.status = 'On-Scene';
  
  Promise.all([
    convex.mutation(api.db.upsertAmbulanceTrip, t),
    f ? convex.mutation(api.db.upsertAmbulanceFleet, f) : Promise.resolve()
  ]).then(() => {
    showToast(`Ambulance reached pickup scene.`);
    window.renderTransportDispatch();
  });
};

window.completeAmbulanceTrip = function(tripId) {
  const t = STATE.ambulanceTrips.find(tr => tr.id === tripId);
  if (!t) return;
  
  t.status = 'Arrived Hospital';
  t.timestamps.hospitalArrival = new Date().toISOString();
  
  const f = STATE.ambulanceFleet.find(fl => fl.id === t.vehicleId);
  if (f) f.status = 'Available';
  
  const billingId = `INV-${Date.now().toString().slice(-4)}`;
  const newInvoice = {
    id: billingId,
    patientId: 'AURA-2026-0001',
    services: [{ description: 'Emergency Ambulance Transport Charge', quantity: 1, rate: 1500, amount: 1500 }],
    subtotal: 1500,
    gst: 75,
    insuranceCover: 0,
    total: 1575,
    status: 'Unsettled',
    date: new Date().toISOString()
  };
  
  Promise.all([
    convex.mutation(api.db.upsertAmbulanceTrip, t),
    f ? convex.mutation(api.db.upsertAmbulanceFleet, f) : Promise.resolve(),
    convex.mutation(api.db.upsertBillingInvoice, newInvoice)
  ]).then(() => {
    showToast("Ambulance returned. transport charge ₹1500 added to billing ledger.");
    logAudit('Edit', tripId, `Completed ambulance transit. Generated invoice ${billingId}`);
    window.renderTransportDispatch();
  });
};

window.renderTransportFleet = function() {
  const container = document.getElementById('transport-fleet');
  if (!container) return;
  
  const list = STATE.ambulanceFleet || [];
  let rows = list.map(v => `
    <tr>
      <td><strong>${v.id}</strong></td>
      <td>${v.vehicleNum}</td>
      <td>${v.type}</td>
      <td><span class="status-indicator ${v.status === 'Available' ? 'status-done' : 'status-active'}">${v.status}</span></td>
      <td>${v.lastServiceDate}</td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Ambulance Fleet Status</h3>
    <div class="table-wrapper" style="margin-top:12px;">
      <table class="ehr-table">
        <thead>
          <tr><th>ID</th><th>Vehicle Registration</th><th>Type</th><th>Status</th><th>Last Service</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">Fleet registry empty.</td></tr>'}</tbody>
      </table>
    </div>
  `;
};

window.renderTransportTrips = function() {
  const container = document.getElementById('transport-trips');
  if (!container) return;
  
  const list = STATE.ambulanceTrips || [];
  let rows = list.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.vehicleId}</td>
      <td>${t.callerName}</td>
      <td>${t.pickupLocation}</td>
      <td><span class="status-indicator status-done">${t.status}</span></td>
      <td>${t.timestamps.callReceived ? new Date(t.timestamps.callReceived).toLocaleTimeString() : '-'}</td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Historical Trip Logs</h3>
    <div class="table-wrapper" style="margin-top:12px;">
      <table class="ehr-table">
        <thead>
          <tr><th>ID</th><th>Vehicle</th><th>Caller</th><th>Location</th><th>Status</th><th>Time</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No trip logs filed.</td></tr>'}</tbody>
      </table>
    </div>
  `;
};

window.renderTransportVehicles = function() {
  const container = document.getElementById('transport-vehicles');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Register Fleet Vehicle</h3>
      <form onsubmit="event.preventDefault(); saveFleetVehicle()">
        <div class="form-group"><label>Vehicle Registration Number *</label><input type="text" id="fv-reg" placeholder="KA-03-GA-1234" required></div>
        <div class="form-group"><label>Ambulance Type *</label>
          <select id="fv-type" required>
            <option>Advanced Life Support (ALS)</option>
            <option>Basic Life Support (BLS)</option>
            <option>Patient Transport Van</option>
          </select>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>Insurance Expiry Date</label><input type="date" id="fv-ins" value="${new Date(Date.now() + 180*24*3600*1000).toISOString().split('T')[0]}" required></div>
          <div class="form-group"><label>Fitness Certificate Expiry</label><input type="date" id="fv-fit" value="${new Date(Date.now() + 360*24*3600*1000).toISOString().split('T')[0]}" required></div>
        </div>
        <button class="glass-btn glass-btn-primary" type="submit" style="width:100%; margin-top:10px;">Register Vehicle</button>
      </form>
    </div>
  `;
};

window.saveFleetVehicle = function() {
  const reg = document.getElementById('fv-reg').value.trim();
  const type = document.getElementById('fv-type').value;
  const ins = document.getElementById('fv-ins').value;
  
  const vId = `AMB-0${STATE.ambulanceFleet.length + 1}`;
  const newV = {
    id: vId,
    vehicleNum: reg,
    type,
    status: 'Available',
    insuranceExpiry: ins,
    lastServiceDate: new Date().toISOString().split('T')[0]
  };
  
  convex.mutation(api.db.upsertAmbulanceFleet, newV).then(() => {
    showToast(`Vehicle registered to Fleet: ${vId}`);
    logAudit('Create', vId, `Registered new ambulance vehicle ${reg}`);
    STATE.activePanel = 'transport-fleet';
    navigateToPanel('transport-fleet');
  });
};

// --- EXTRA LAB SUB PANELS ---
window.renderLabCompleted = function() {
  const container = document.getElementById('lab-completed');
  if (!container) return;
  
  const completed = STATE.investigations.filter(i => i.status === 'Reported' && i.type === 'Lab');
  let listHtml = completed.map(i => {
    return `<div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.75rem;">
      <div class="flex-between"><strong>${i.testName}</strong> <span class="status-indicator status-done">Reported</span></div>
      <div style="margin-top:4px;">Patient ID: ${i.patientId} | Parameter: ${i.parameter} | Value: <strong>${i.value}</strong></div>
      <div style="font-size:0.7rem; color:var(--text-3); margin-top:4px;">Findings: ${i.findings || 'N/A'}</div>
    </div>`;
  }).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Completed Lab Reports Archive</h3>
    <div style="max-height: 400px; overflow-y: auto; margin-top:10px;">
      ${listHtml || '<p style="color:var(--text-3); text-align:center;">No completed reports found.</p>'}
    </div>
  `;
};

window.renderLabTracker = function() {
  const container = document.getElementById('lab-tracker');
  if (!container) return;
  
  const list = STATE.investigations.filter(i => i.type === 'Lab');
  let rows = list.map(i => {
    return `
      <tr>
        <td><code>${i.id}</code></td>
        <td><code>${i.patientId}</code></td>
        <td>${i.testName}</td>
        <td><span class="status-indicator ${i.status === 'Reported' ? 'status-done' : 'status-pending'}">${i.status}</span></td>
        <td>${i.timestamp ? new Date(i.timestamp).toLocaleTimeString() : '-'}</td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Sample Accession Pipeline</h3>
    <div class="table-wrapper" style="margin-top:12px;">
      <table class="ehr-table">
        <thead>
          <tr><th>Accession Code</th><th>Patient ID</th><th>Test Name</th><th>Status</th><th>Timestamp</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">No active lab trackers.</td></tr>'}</tbody>
      </table>
    </div>
  `;
};

window.renderLabQC = function() {
  const container = document.getElementById('lab-qc');
  if (!container) return;
  
  container.innerHTML = `
    <h3 class="form-title">Laboratory Quality Control Dashboard</h3>
    <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); margin-top:12px;">
      <div class="glass-card" style="text-align:center; padding:12px;">
        <strong>Accuracy Rate</strong>
        <div style="font-size:1.6rem; font-weight:700; color:var(--success); margin-top:6px;">99.4%</div>
      </div>
      <div class="glass-card" style="text-align:center; padding:12px;">
        <strong>Average TAT</strong>
        <div style="font-size:1.6rem; font-weight:700; color:var(--primary); margin-top:6px;">35 Min</div>
      </div>
      <div class="glass-card" style="text-align:center; padding:12px;">
        <strong>Active QC Alerter</strong>
        <div style="font-size:1.6rem; font-weight:700; color:var(--warning); margin-top:6px;">0 Alerts</div>
      </div>
    </div>
  `;
};

window.renderLabReagents = function() {
  const container = document.getElementById('lab-reagents');
  if (!container) return;
  
  const list = STATE.labReagents || [];
  let rows = list.map(r => {
    let stat = 'status-done';
    if (r.status === 'Low') stat = 'status-pending';
    if (r.status === 'Critical') stat = 'status-canceled';
    return `
      <tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.stock} Units</td>
        <td>${r.expiry}</td>
        <td><span class="status-indicator ${stat}">${r.status}</span></td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Reagents & Diagnostics Consumables</h3>
    <div class="table-wrapper" style="margin-top:12px;">
      <table class="ehr-table">
        <thead>
          <tr><th>Reagent Kit</th><th>Current Stock</th><th>Expiry Date</th><th>Status</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--text-3)">No stock logs found.</td></tr>'}</tbody>
      </table>
    </div>
  `;
};

// --- EXTRA RADIOLOGY SUB PANELS ---
window.renderRadiologyCompleted = function() {
  const container = document.getElementById('radiology-completed');
  if (!container) return;
  
  const list = STATE.investigations.filter(i => i.status === 'Reported' && i.type === 'Radiology');
  let cards = list.map(r => `
    <div class="glass-card" style="margin-bottom:10px;">
      <div class="flex-between"><strong>Study: ${r.testName}</strong> <span class="status-indicator status-done">Reported</span></div>
      <div style="font-size:0.75rem; margin:6px 0;">Patient: ${r.patientId} | Parameter: ${r.parameter}</div>
      <div style="background:var(--bg); padding:6px; border-radius:4px; font-size:0.75rem; font-family:monospace; margin-bottom:8px;">${r.value}</div>
      <button class="glass-btn glass-btn-secondary" style="padding:2px 6px; font-size:0.7rem;" onclick="amendRadioReport('${r.id}')">Amend Report</button>
    </div>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Completed Radiology Studies</h3>
    <div style="max-height: 450px; overflow-y: auto; margin-top:12px;">
      ${cards || '<p style="color:var(--text-3); text-align:center;">No studies archive found.</p>'}
    </div>
  `;
};

window.amendRadioReport = function(iId) {
  const i = STATE.investigations.find(inve => inve.id === iId);
  if (!i) return;
  
  const text = prompt("Enter Amendment Addendum Text:", i.value);
  if (!text) return;
  
  i.value = `${i.value}\n[AMENDMENT ${new Date().toLocaleDateString()}]: ${text}`;
  i.status = 'Reported';
  
  convex.mutation(api.db.upsertInvestigation, i).then(() => {
    showToast("Radiology study report amended successfully.");
    window.renderRadiologyCompleted();
  });
};

window.renderRadiologySchedule = function() {
  const container = document.getElementById('radiology-schedule');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Schedule Modality Imaging Scan</h3>
      <form onsubmit="event.preventDefault(); saveRadioSchedule()">
        <div class="form-group"><label>Patient ID *</label><input type="text" id="rs-pat" placeholder="AURA-2026-0001" required></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label>Modality *</label>
            <select id="rs-modality" required><option>MRI Scan</option><option>CT Scan</option><option>X-Ray</option><option>Ultrasound</option></select>
          </div>
          <div class="form-group"><label>Target Region *</label><input type="text" id="rs-region" placeholder="Brain, Lumbar Spine, Abdomen" required></div>
        </div>
        <div class="form-grid" style="grid-template-columns:1.2fr 1fr; gap:10px;">
          <div class="form-group"><label>Scheduled Date</label><input type="date" id="rs-date" value="${new Date().toISOString().split('T')[0]}" required></div>
          <div class="form-group"><label>Time Slot</label><input type="time" id="rs-time" value="10:00" required></div>
        </div>
        <button class="glass-btn glass-btn-primary" type="submit" style="width:100%; margin-top:10px;">Reserve Scanner Slot</button>
      </form>
    </div>
  `;
};

window.saveRadioSchedule = function() {
  const pId = document.getElementById('rs-pat').value.trim();
  const modality = document.getElementById('rs-modality').value;
  const region = document.getElementById('rs-region').value.trim();
  const date = document.getElementById('rs-date').value;
  const time = document.getElementById('rs-time').value;
  
  const pat = STATE.patients.find(pt => pt.id === pId);
  if (!pat) {
    showToast("Invalid Patient ID", "error");
    return;
  }
  
  const newStudy = {
    id: `IMG-${Date.now().toString().slice(-4)}`,
    patientId: pId,
    type: 'Radiology',
    testName: `${modality}: ${region}`,
    status: 'Pending',
    parameter: region,
    value: 'Awaiting imaging scan...',
    timestamp: `${date}T${time}:00.000Z`
  };
  
  convex.mutation(api.db.upsertInvestigation, newStudy).then(() => {
    showToast(`Imaging Scan Scheduled: ${newStudy.id}`);
    logAudit('Create', newStudy.id, `Scheduled ${modality} for ${pId}`);
    STATE.activePanel = 'radiology-queue';
    navigateToPanel('radiology-queue');
  });
};

window.renderRadiologyTAT = function() {
  const container = document.getElementById('radiology-tat');
  if (!container) return;
  
  container.innerHTML = `
    <h3 class="form-title">Modality Performance (TAT Monitor)</h3>
    <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-top:15px;">
      <div class="glass-card" style="text-align:center; padding:10px;"><strong style="font-size:0.75rem;">MRI TAT</strong><div style="font-size:1.4rem; font-weight:700; color:var(--primary); margin-top:4px;">55 Min</div></div>
      <div class="glass-card" style="text-align:center; padding:10px;"><strong style="font-size:0.75rem;">CT TAT</strong><div style="font-size:1.4rem; font-weight:700; color:var(--primary); margin-top:4px;">40 Min</div></div>
      <div class="glass-card" style="text-align:center; padding:10px;"><strong style="font-size:0.75rem;">X-Ray TAT</strong><div style="font-size:1.4rem; font-weight:700; color:var(--primary); margin-top:4px;">20 Min</div></div>
      <div class="glass-card" style="text-align:center; padding:10px;"><strong style="font-size:0.75rem;">USG TAT</strong><div style="font-size:1.4rem; font-weight:700; color:var(--primary); margin-top:4px;">30 Min</div></div>
    </div>
  `;
};

// --- EXTRA PHARMACY SUB PANELS ---
window.renderPharmacyInventory = function() {
  const container = document.getElementById('pharmacy-inventory');
  if (!container) return;
  
  const list = STATE.pharmacyInventory || [];
  let rows = list.map(d => {
    let stat = 'status-done';
    if (d.status === 'Low') stat = 'status-pending';
    if (d.status === 'Critical') stat = 'status-canceled';
    return `
      <tr>
        <td class="text-bold">${d.name}</td>
        <td>${d.stock}</td>
        <td><code>${d.batch}</code></td>
        <td>${d.expiry}</td>
        <td><span class="status-indicator ${stat}">${d.status}</span></td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns:1fr 1.8fr; gap:16px;">
      <div class="glass-card">
        <h3 class="form-title">Stock In / Purchase Registry</h3>
        <form onsubmit="event.preventDefault(); saveInventoryReceipt()">
          <div class="form-group"><label>Drug Description *</label><input type="text" id="ph-rec-name" placeholder="Paracetamol 650mg" required></div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group"><label>Batch *</label><input type="text" id="ph-rec-batch" placeholder="B102" required></div>
            <div class="form-group"><label>Units Received *</label><input type="number" id="ph-rec-qty" placeholder="1000" required></div>
          </div>
          <div class="form-group"><label>Expiry Date *</label><input type="date" id="ph-rec-exp" value="${new Date(Date.now() + 365*24*3600*1000).toISOString().split('T')[0]}" required></div>
          <button class="glass-btn glass-btn-primary" type="submit">Record GRN Receipt</button>
        </form>
      </div>
      <div class="glass-card">
        <h3 class="form-title">Active Pharmacy Stock Ledger</h3>
        <div class="table-wrapper">
          <table class="ehr-table">
            <thead>
              <tr><th>Drug Description</th><th>Stock Units</th><th>Batch</th><th>Expiry</th><th>Status</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">Inventory ledger empty.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
};

window.saveInventoryReceipt = function() {
  const name = document.getElementById('ph-rec-name').value.trim();
  const batch = document.getElementById('ph-rec-batch').value.trim();
  const qty = parseInt(document.getElementById('ph-rec-qty').value);
  const exp = document.getElementById('ph-rec-exp').value;
  
  let drug = STATE.pharmacyInventory.find(di => di.name.toLowerCase() === name.toLowerCase());
  
  if (drug) {
    drug.stock += qty;
    drug.batch = batch;
    drug.expiry = exp;
    drug.status = drug.stock >= drug.reorderLevel ? 'OK' : 'Low';
  } else {
    drug = {
      id: `DRG-${Date.now().toString().slice(-4)}`,
      name, stock: qty, batch, expiry: exp, reorderLevel: 200, status: 'OK', category: 'General'
    };
  }
  
  convex.mutation(api.db.upsertPharmacyInventory, drug).then(() => {
    showToast("GRN Stock entry processed successfully.");
    logAudit('Edit', drug.id, `Stock Receipt: Added ${qty} units of ${name}`);
    window.renderPharmacyInventory();
  });
};

window.renderPharmacyExpiry = function() {
  const container = document.getElementById('pharmacy-expiry');
  if (!container) return;
  
  const list = STATE.pharmacyInventory || [];
  const nearExpiry = list.filter(d => {
    const diff = new Date(d.expiry) - new Date();
    const days = diff / (24*3600*1000);
    return days <= 90;
  });
  
  let cards = nearExpiry.map(d => `
    <div style="background:var(--danger-bg); border:1px solid var(--danger); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.75rem;">
      <div class="flex-between"><strong>${d.name}</strong> <span class="status-indicator status-canceled">Expiring Soon</span></div>
      <div style="margin-top:4px;">Batch: ${d.batch} | Stock: ${d.stock} Units | Expiry: <strong>${d.expiry}</strong></div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Expiry Warnings (90 Days Threshold)</h3>
    <div style="max-height:400px; overflow-y:auto; margin-top:12px;">
      ${cards || '<p style="color:var(--success); font-weight:600; text-align:center; padding:30px;">✓ No stock lines expiring within 90 days.</p>'}
    </div>
  `;
};

window.renderPharmacyPO = function() {
  const container = document.getElementById('pharmacy-po');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card" style="max-width:550px; margin:auto;">
      <h3 class="form-title">Purchase Order Generator</h3>
      <form onsubmit="event.preventDefault(); generatePO()">
        <div class="form-group"><label>Supplier Name *</label><input type="text" id="po-supplier" placeholder="Aurobindo Pharma" required></div>
        <div class="form-group"><label>Drug Details & Quantity *</label><input type="text" id="po-drug" placeholder="Paracetamol 650mg (5000 Tab)" required></div>
        <button class="glass-btn glass-btn-primary" type="submit" style="width:100%;">Dispatch Purchase Order</button>
      </form>
    </div>
  `;
};

window.generatePO = function() {
  const supplier = document.getElementById('po-supplier').value;
  const drug = document.getElementById('po-drug').value;
  
  showToast(`PO generated & sent to ${supplier}`);
  logAudit('Create', 'SYS', `Dispatched PO for ${drug} to ${supplier}`);
  document.getElementById('po-supplier').value = '';
  document.getElementById('po-drug').value = '';
};

// --- EXTRA FINANCE SUB PANELS ---
window.renderFinancePaid = function() {
  const container = document.getElementById('finance-paid');
  if (!container) return;
  
  const paid = STATE.billingInvoices.filter(inv => inv.status === 'Paid');
  let list = paid.map(inv => `
    <div class="records-list-item">
      <div class="flex-between"><strong>Invoice: ${inv.id}</strong> <span>Paid: ₹${inv.total}</span></div>
      <div style="font-size:0.75rem; color:var(--text-2); margin-top:4px;">Patient: ${inv.patientId} | Mode: ${inv.paymentMode || 'UPI'}</div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Settled Invoices Archive</h3>
    <div style="max-height: 400px; overflow-y: auto; margin-top:12px;">
      ${list || '<p style="color:var(--text-3); text-align:center;">No settled invoices.</p>'}
    </div>
  `;
};

window.renderFinanceDaily = function() {
  const container = document.getElementById('finance-daily');
  if (!container) return;
  
  const settled = STATE.billingInvoices.filter(inv => inv.status === 'Paid');
  let totals = { Cash: 0, Card: 0, UPI: 0, Insurance: 0 };
  
  settled.forEach(inv => {
    const m = inv.paymentMode || 'Cash';
    if (m.includes('UPI')) totals.UPI += inv.total;
    else if (m.includes('Card')) totals.Card += inv.total;
    else if (m.includes('Insurance')) totals.Insurance += inv.total;
    else totals.Cash += inv.total;
  });
  
  container.innerHTML = `
    <h3 class="form-title">Daily Collection Settlement Summary</h3>
    <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-top:15px;">
      <div class="glass-card" style="padding:12px; text-align:center;"><strong>Cash Settlement</strong><div style="font-size:1.4rem; font-weight:700; color:var(--success); margin-top:6px;">₹${totals.Cash}</div></div>
      <div class="glass-card" style="padding:12px; text-align:center;"><strong>UPI QR Settlement</strong><div style="font-size:1.4rem; font-weight:700; color:var(--success); margin-top:6px;">₹${totals.UPI}</div></div>
      <div class="glass-card" style="padding:12px; text-align:center;"><strong>Card Settlement</strong><div style="font-size:1.4rem; font-weight:700; color:var(--success); margin-top:6px;">₹${totals.Card}</div></div>
      <div class="glass-card" style="padding:12px; text-align:center;"><strong>TPA Pre-Auth Settle</strong><div style="font-size:1.4rem; font-weight:700; color:var(--success); margin-top:6px;">₹${totals.Insurance}</div></div>
    </div>
  `;
};

window.renderFinanceAnalytics = function() {
  const container = document.getElementById('finance-analytics');
  if (!container) return;
  
  let totalRev = STATE.billingInvoices.filter(i=>i.status==='Paid').reduce((acc, curr)=>acc+curr.total, 0);
  
  container.innerHTML = `
    <h3 class="form-title">Real-Time Financial Collections</h3>
    <div class="stats-grid" style="grid-template-columns: 1fr; margin-top:12px;">
      <div class="glass-card" style="padding:15px; text-align:center;">
        <strong>Total Consolidated Revenue</strong>
        <div style="font-size:2rem; font-weight:700; color:var(--primary); margin-top:8px;">₹${totalRev}</div>
      </div>
    </div>
  `;
};

window.renderFinanceOutstanding = function() {
  const container = document.getElementById('finance-outstanding');
  if (!container) return;
  
  const unpaid = STATE.billingInvoices.filter(i => i.status === 'Unsettled');
  let list = unpaid.map(i => `
    <div style="background:var(--danger-bg); border:1px solid var(--danger); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.75rem;">
      <div class="flex-between"><strong>Invoice: ${i.id}</strong> <span class="status-indicator status-canceled">Unsettled</span></div>
      <div style="margin-top:4px;">Patient ID: ${i.patientId} | Balance Due: <strong>₹${i.total}</strong></div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <h3 class="form-title">Outstanding Aging Reports (Unpaid Ledger)</h3>
    <div style="max-height: 400px; overflow-y: auto; margin-top:12px;">
      ${list || '<p style="color:var(--success); font-weight:600; text-align:center; padding:30px;">✓ All invoices settled.</p>'}
    </div>
  `;
};

window.renderAdminDashboardStats = function() {
  const staffCount = STAFF_ACCOUNTS.length;
  const patientCount = STATE.patients.length;
  const deviceCount = STATE.devices.length;
  const openComplaints = STATE.complaints.filter(c => c.status === 'Open').length;
  
  const elStaff = document.getElementById('admin-stat-staff');
  const elPatients = document.getElementById('admin-stat-patients');
  const elDevices = document.getElementById('admin-stat-devices');
  const elComplaints = document.getElementById('admin-stat-complaints');
  
  if (elStaff) elStaff.textContent = staffCount;
  if (elPatients) elPatients.textContent = patientCount;
  if (elDevices) elDevices.textContent = deviceCount;
  if (elComplaints) elComplaints.textContent = openComplaints;
};

// ==========================================
// 23. MVP EXPANSION ENHANCEMENTS
// ==========================================

function applySystemSettingsUI() {
  const settings = STATE.systemSettings;
  if (!settings) return;

  const hn = document.getElementById('settings-hospital-name');
  if (hn) hn.value = settings.hospitalName || '';

  const hhl = document.getElementById('settings-hospital-helpline');
  if (hhl) hhl.value = settings.helpline || '';

  const p2fa = document.getElementById('policy-2fa');
  if (p2fa) p2fa.checked = settings.policy2fa !== false;

  const st = document.getElementById('settings-session-timeout');
  if (st) st.value = settings.sessionTimeout || '30 min';

  const pp = document.getElementById('settings-password-policy');
  if (pp) pp.value = settings.passwordPolicy || 'Strong';

  const iw = document.getElementById('settings-ip-whitelisting');
  if (iw) iw.checked = !!settings.ipWhitelisting;

  const mph = document.getElementById('module-pharmacy');
  if (mph) mph.checked = settings.modulePharmacy !== false;

  const mra = document.getElementById('module-radiology');
  if (mra) mra.checked = settings.moduleRadiology !== false;

  const mla = document.getElementById('module-lab');
  if (mla) mla.checked = settings.moduleLab !== false;

  const mpp = document.getElementById('module-patient-portal');
  if (mpp) mpp.checked = settings.modulePatientPortal !== false;

  const mat = document.getElementById('module-ai-triage');
  if (mat) mat.checked = settings.moduleAiTriage !== false;

  const pr = document.getElementById('policy-retention');
  if (pr) pr.value = settings.policyRetention || '7';

  // Toggle roles visibility in global role selector
  const select = document.getElementById('global-role-select');
  if (select) {
    Array.from(select.options).forEach(opt => {
      const val = opt.value;
      let visible = true;
      if (val === 'pharmacy' && !settings.modulePharmacy) visible = false;
      if (val === 'radiology' && !settings.moduleRadiology) visible = false;
      if (val === 'lab' && !settings.moduleLab) visible = false;
      if (val === 'patient' && !settings.modulePatientPortal) visible = false;
      opt.style.display = visible ? '' : 'none';
    });
  }

  // Refresh current sidebar nav
  renderSidebarNav();
}

window.saveSystemSettings = async function() {
  const hospitalName = document.getElementById('settings-hospital-name')?.value || '';
  const helpline = document.getElementById('settings-hospital-helpline')?.value || '';
  const policy2fa = document.getElementById('policy-2fa')?.checked || false;
  const sessionTimeout = document.getElementById('settings-session-timeout')?.value || '';
  const passwordPolicy = document.getElementById('settings-password-policy')?.value || '';
  const ipWhitelisting = document.getElementById('settings-ip-whitelisting')?.checked || false;
  const modulePharmacy = document.getElementById('module-pharmacy')?.checked || false;
  const moduleRadiology = document.getElementById('module-radiology')?.checked || false;
  const moduleLab = document.getElementById('module-lab')?.checked || false;
  const modulePatientPortal = document.getElementById('module-patient-portal')?.checked || false;
  const moduleAiTriage = document.getElementById('module-ai-triage')?.checked || false;
  const policyRetention = document.getElementById('policy-retention')?.value || '';

  const docData = {
    id: 'system-settings',
    hospitalName,
    helpline,
    policy2fa,
    sessionTimeout,
    passwordPolicy,
    ipWhitelisting,
    modulePharmacy,
    moduleRadiology,
    moduleLab,
    modulePatientPortal,
    moduleAiTriage,
    policyRetention
  };

  try {
    await convex.mutation(api.db.upsertSystemSettings, docData);
    showToast('System settings saved successfully!');
    logAudit('Edit', 'SYS', 'Updated System Settings & Compliance Policies');
  } catch (error) {
    showToast('Failed to save settings: ' + error.message, 'error');
  }
};

window.exportAllCollectionsToCSV = function() {
  let csvContent = "";

  const collections = [
    { name: "Patients", data: STATE.patients },
    { name: "Appointments", data: STATE.appointments },
    { name: "ClinicalRecords", data: STATE.clinicalRecords },
    { name: "Investigations", data: STATE.investigations },
    { name: "BillingInvoices", data: STATE.billingInvoices },
    { name: "AuditLogs", data: STATE.auditLogs },
    { name: "Vitals", data: STATE.vitals },
    { name: "Devices", data: STATE.devices },
    { name: "Complaints", data: STATE.complaints },
    { name: "Notifications", data: STATE.notifications },
    { name: "EmergencyCases", data: STATE.emergencyCases },
    { name: "IcuAdmissions", data: STATE.icuAdmissions },
    { name: "IcuCharting", data: STATE.icuCharting },
    { name: "Surgeries", data: STATE.surgeries },
    { name: "OtSchedule", data: STATE.otSchedule },
    { name: "BloodInventory", data: STATE.bloodInventory },
    { name: "Donors", data: STATE.donors },
    { name: "BloodRequests", data: STATE.bloodRequests },
    { name: "DietOrders", data: STATE.dietOrders },
    { name: "AmbulanceTrips", data: STATE.ambulanceTrips },
    { name: "AmbulanceFleet", data: STATE.ambulanceFleet },
    { name: "DischargeSummaries", data: STATE.dischargeSummaries },
    { name: "Messages", data: STATE.messages },
    { name: "PharmacyInventory", data: STATE.pharmacyInventory },
    { name: "LabReagents", data: STATE.labReagents }
  ];

  collections.forEach(col => {
    csvContent += `=== COLLECTION: ${col.name.toUpperCase()} ===\n`;
    if (col.data.length === 0) {
      csvContent += "(empty)\n\n";
      return;
    }
    
    const headers = Object.keys(col.data[0]);
    csvContent += headers.join(",") + "\n";
    
    col.data.forEach(row => {
      const line = headers.map(header => {
        let val = row[header];
        if (val === undefined || val === null) return "";
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        } else {
          val = String(val);
        }
        val = val.replace(/"/g, '""');
        if (val.includes(",") || val.includes("\n") || val.includes('"')) {
          val = `"${val}"`;
        }
        return val;
      });
      csvContent += line.join(",") + "\n";
    });
    csvContent += "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `AtralOS_Backup_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("All collections exported to CSV successfully!");
  logAudit('View', 'SYS', 'Executed Hospital Database CSV Export');
};

window.schedulePortalAppointment = async function() {
  const patientId = STATE.patientPWA.activePatientId;
  if (!patientId) {
    showToast("Please log in to your patient portal first.", "error");
    return;
  }

  const docList = DOCTORS.map((d, idx) => `${idx + 1}. ${d.name} (${d.dept})`).join('\n');
  const docChoice = prompt(`Select Doctor:\n${docList}\n\nEnter number (1-${DOCTORS.length}):`, "1");
  if (!docChoice) return;
  const docIdx = parseInt(docChoice) - 1;
  const doctor = DOCTORS[docIdx];
  if (!doctor) {
    showToast("Invalid doctor selection", "error");
    return;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];
  const dateStr = prompt("Enter Appointment Date (YYYY-MM-DD):", defaultDate);
  if (!dateStr) return;

  const timeStr = prompt("Enter Appointment Time (HH:MM):", "10:00");
  if (!timeStr) return;

  const visitType = prompt("Enter Visit Type (New, Follow-up, Routine, Health Checkup):", "New");
  if (!visitType) return;

  const token = STATE.appointments.filter(a => a.doctorId === doctor.id && a.date === dateStr).length + 1;

  const aptId = `APT-${Date.now().toString().slice(-4)}`;
  const newApt = {
    id: aptId,
    patientId: patientId,
    doctorId: doctor.id,
    department: doctor.dept,
    date: dateStr,
    time: timeStr,
    type: visitType,
    status: 'Booked',
    token: token,
    investigationStatus: 'None',
    timestamp: new Date().toISOString()
  };

  try {
    await convex.mutation(api.db.upsertAppointment, newApt);
    showToast(`Appointment successfully scheduled! Token: #${token}`);
    logAudit('Create', aptId, `Patient scheduled appointment online with ${doctor.name}`);
    renderPatientPortalPWA();
  } catch (err) {
    showToast("Failed to book appointment: " + err.message, "error");
  }
};

window.showDeviceDetails = function(deviceId) {
  const dev = (STATE.devices.length > 0 ? STATE.devices : SEED_DEVICES).find(d => d.id === deviceId);
  if (!dev) return;

  const body = document.getElementById('device-detail-body');
  if (body) {
    body.innerHTML = `
      <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-1);">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Device Name:</strong> <span>${dev.name}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Device ID:</strong> <span>${dev.id}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Type:</strong> <span>${dev.type}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Department:</strong> <span>${dev.department}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Location:</strong> <span>${dev.location || 'N/A'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Serial Number:</strong> <code>${dev.serialNumber || 'SN-N/A'}</code>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Current Status:</strong> <span class="status-indicator ${dev.status === 'Active' ? 'status-done' : 'status-canceled'}">${dev.status}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Last Service Date:</strong> <span>${dev.lastServiceDate || 'N/A'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong>Next Maintenance Due:</strong> <span>${dev.maintenanceDue || 'N/A'}</span>
        </div>
        <div style="margin-top:15px;">
          <strong>Maintenance / Service Logs:</strong>
          <div style="background:var(--bg); border:1px solid var(--border); padding:8px; border-radius:4px; font-size:0.75rem; color:var(--text-2); margin-top:6px; font-family:monospace; white-space:pre-wrap;">
${dev.notes || 'No active service/maintenance logs filed.'}
          </div>
        </div>
      </div>
    `;
  }
  document.getElementById('modal-device-detail').classList.add('open');
  logAudit('View', dev.id, `Opened Device Maintenance Details for ${dev.name}`);
};

window.handleBedClick = function(bedId) {
  const bed = BED_DATA.find(b => b.id === bedId);
  if (!bed) return;

  const modal = document.getElementById('modal-bed-management');
  const title = document.getElementById('bed-mgmt-title');
  const body = document.getElementById('bed-mgmt-body');
  if (!modal || !title || !body) return;

  title.textContent = `Bed Management: ${bedId} (${bed.ward})`;
  
  if (bed.status === 'available') {
    // Show patient assignment list
    const availablePatients = STATE.patients.filter(p => p.status === 'OPD Queue' || p.status === 'Booked');
    
    let optionsHtml = availablePatients.length === 0 
      ? `<p style="font-size:0.75rem; color:var(--text-3); text-align:center; padding:10px;">No patients waiting in queue to assign.</p>`
      : availablePatients.map(p => `
          <div class="glass-card" style="padding:10px; margin-bottom:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="assignPatientToBedFromModal('${bedId}', '${p.id}')">
            <div>
              <strong style="color:var(--primary); font-size:0.8rem;">${p.name}</strong>
              <div style="font-size:0.7rem; color:var(--text-2);">UHID: ${p.id} | DOB: ${p.dob}</div>
            </div>
            <button class="glass-btn glass-btn-primary" style="padding:4px 10px; font-size:0.68rem;">Assign</button>
          </div>
        `).join('');

    body.innerHTML = `
      <div style="font-size:0.8rem; margin-bottom:10px;">Select a patient from the queue to admit/assign to <strong>${bedId}</strong>:</div>
      <div style="max-height:300px; overflow-y:auto;">
        ${optionsHtml}
      </div>
    `;
  }
  
  else if (bed.status === 'occupied') {
    const patient = STATE.patients.find(p => p.id === bed.patient);
    const availableBeds = BED_DATA.filter(b => b.status === 'available');

    let bedsOptionsHtml = availableBeds.length === 0
      ? `<p style="font-size:0.75rem; color:var(--text-3);">No other available beds for transfer.</p>`
      : availableBeds.map(b => `
          <div class="glass-card" style="padding:8px; margin-bottom:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="transferPatientFromModal('${bedId}', '${b.id}')">
            <span style="font-weight:700; font-size:0.8rem;">${b.id} (${b.ward})</span>
            <button class="glass-btn glass-btn-secondary" style="padding:2px 8px; font-size:0.65rem;">Transfer Here</button>
          </div>
        `).join('');

    body.innerHTML = `
      <div style="font-size:0.8rem; border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:10px;">
        <strong>Current Patient:</strong> ${patient ? patient.name : 'Unknown'} (${bed.patient}) <br>
        <button class="glass-btn glass-btn-secondary" style="color:var(--danger); border-color:var(--danger); font-size:0.7rem; padding:4px 8px; margin-top:8px;" onclick="dischargePatientFromBedModal('${bedId}')">Discharge & Mark Cleaning</button>
      </div>
      <div style="font-size:0.8rem; font-weight:700; color:var(--primary); margin-bottom:8px;">Transfer Patient to Available Bed:</div>
      <div style="max-height:200px; overflow-y:auto;">
        ${bedsOptionsHtml}
      </div>
    `;
  }

  else if (bed.status === 'cleaning') {
    body.innerHTML = `
      <div style="text-align:center; padding:15px;">
        <p style="font-size:0.8rem; color:var(--text-2); margin-bottom:12px;">This bed is currently undergoing cleaning/disinfection.</p>
        <button class="glass-btn glass-btn-primary" style="padding:6px 14px; font-size:0.75rem;" onclick="markBedAvailableFromModal('${bedId}')">Mark Clean & Available</button>
      </div>
    `;
  }

  modal.classList.add('open');
};

window.assignPatientToBedFromModal = async function(bedId, patientId) {
  const bed = BED_DATA.find(b => b.id === bedId);
  const pat = STATE.patients.find(p => p.id === patientId);
  if (!bed || !pat) return;

  bed.status = 'occupied';
  bed.patient = pat.id;
  pat.bedAssignment = bedId;
  pat.status = 'Admitted';

  try {
    await mutatePatient(pat);
    showToast(`Successfully assigned ${pat.name} to bed ${bedId}`);
    logAudit('Edit', pat.id, `Assigned patient to bed ${bedId}`);
    document.getElementById('modal-bed-management').classList.remove('open');
    renderBedGrid();
    if (document.getElementById('nursing-bedmgmt-sub-grid')) {
      renderNursingBedMgmt();
    }
  } catch (err) {
    showToast("Failed to assign patient: " + err.message, "error");
  }
};

window.transferPatientFromModal = async function(oldBedId, newBedId) {
  const oldBed = BED_DATA.find(b => b.id === oldBedId);
  const newBed = BED_DATA.find(b => b.id === newBedId);
  if (!oldBed || !newBed) return;

  const patientId = oldBed.patient;
  const pat = STATE.patients.find(p => p.id === patientId);

  newBed.status = 'occupied';
  newBed.patient = patientId;
  oldBed.status = 'cleaning';
  delete oldBed.patient;

  if (pat) {
    pat.bedAssignment = newBedId;
    try {
      await mutatePatient(pat);
      showToast(`Transferred patient to ${newBedId}`);
      logAudit('Edit', patientId, `Transferred patient from bed ${oldBedId} to ${newBedId}`);
      document.getElementById('modal-bed-management').classList.remove('open');
      renderBedGrid();
      if (document.getElementById('nursing-bedmgmt-sub-grid')) {
        renderNursingBedMgmt();
      }
    } catch (err) {
      showToast("Failed to transfer: " + err.message, "error");
    }
  }
};

window.dischargePatientFromBedModal = async function(bedId) {
  const bed = BED_DATA.find(b => b.id === bedId);
  if (!bed) return;

  const patientId = bed.patient;
  const pat = STATE.patients.find(p => p.id === patientId);

  bed.status = 'cleaning';
  delete bed.patient;

  if (pat) {
    pat.bedAssignment = '';
    pat.status = 'Discharged';
    try {
      await mutatePatient(pat);
      showToast(`Discharged patient from bed ${bedId}`);
      logAudit('Edit', patientId, `Discharged patient from bed ${bedId} and flagged for cleaning`);
      document.getElementById('modal-bed-management').classList.remove('open');
      renderBedGrid();
      if (document.getElementById('nursing-bedmgmt-sub-grid')) {
        renderNursingBedMgmt();
      }
    } catch (err) {
      showToast("Failed to discharge: " + err.message, "error");
    }
  }
};

window.markBedAvailableFromModal = function(bedId) {
  const bed = BED_DATA.find(b => b.id === bedId);
  if (bed) {
    bed.status = 'available';
    showToast(`Bed ${bedId} marked as available.`);
    document.getElementById('modal-bed-management').classList.remove('open');
    renderBedGrid();
    if (document.getElementById('nursing-bedmgmt-sub-grid')) {
      renderNursingBedMgmt();
    }
  }
};

window.updateAiDiagnosis = function() {
  const panel = document.getElementById('ai-diagnosis-panel');
  const suggestions = document.getElementById('ai-diagnosis-suggestions');
  if (!panel || !suggestions) return;

  const sText = (document.getElementById('soap-s')?.value || '').toLowerCase();
  if (sText.length < 3) {
    panel.style.display = 'none';
    return;
  }

  let codeSuggestions = [];
  if (sText.includes("chest") || sText.includes("breath") || sText.includes("heart")) {
    codeSuggestions = ["Acute Coronary Syndrome (I24.9)", "Angina Pectoris (I20.9)", "Myocardial Infarction (I21.9)"];
  } else if (sText.includes("fever") || sText.includes("cough") || sText.includes("chill")) {
    codeSuggestions = ["Viral Fever (A99)", "Acute Bronchitis (J20.9)", "Pneumonia (J18.9)"];
  } else if (sText.includes("head") || sText.includes("migraine") || sText.includes("dizzy")) {
    codeSuggestions = ["Migraine (G43.9)", "Tension Headache (G44.2)", "Vertigo (R42)"];
  } else if (sText.includes("stomach") || sText.includes("abdominal") || sText.includes("vomit")) {
    codeSuggestions = ["Acute Gastritis (K29.0)", "Irritable Bowel Syndrome (K58.9)", "Gastroenteritis (A09)"];
  } else {
    codeSuggestions = ["Essential Hypertension (I10)", "Type 2 Diabetes Mellitus (E11.9)", "General Debility (R53.89)"];
  }

  panel.style.display = 'block';
  suggestions.innerHTML = codeSuggestions.map(s => `<span class="tag-chip" style="cursor:pointer; background:var(--light-purple); color:var(--primary); padding:3px 8px; border-radius:4px; margin-right:4px; font-size:0.7rem; display:inline-block;" onclick="addSoapDiagTag('${s.replace(/'/g, "\\'")}')">${s}</span>`).join(' ');
};

window.addSoapDiagTag = function(tag) {
  const cleanTag = tag.split(' (')[0];
  if (!STATE.doctorConsult.soapA_Tags.includes(cleanTag)) {
    STATE.doctorConsult.soapA_Tags.push(cleanTag);
    renderDoctorSoapTags();
  }
};

window.checkDrugInteractions = function() {
  const alertEl = document.getElementById('drug-interaction-alert');
  if (!alertEl) return;

  const meds = STATE.doctorConsult.prescriptionMedicines;
  if (meds.length < 2) {
    alertEl.style.display = 'none';
    return;
  }

  const names = meds.map(m => m.name.toLowerCase());
  const warnings = [];

  const uniqueNames = new Set();
  meds.forEach(m => {
    const name = m.name.split(' - ')[1] || m.name;
    if (uniqueNames.has(name.toLowerCase())) {
      warnings.push(`⚠️ Duplicate Drug Alert: <strong>${name}</strong> is prescribed multiple times.`);
    } else {
      uniqueNames.add(name.toLowerCase());
    }
  });

  const hasMetformin = names.some(n => n.includes('metformin'));
  const hasAmlodipine = names.some(n => n.includes('amlodipine'));
  const hasAmoxicillin = names.some(n => n.includes('amoxicillin'));
  const hasParacetamol = names.some(n => n.includes('paracetamol'));

  if (hasMetformin && hasAmlodipine) {
    warnings.push(`⚠️ Drug-Drug Interaction: <strong>Metformin + Amlodipine</strong>. Risk of altered glycemic control. Monitor glucose levels.`);
  }
  if (hasAmoxicillin && hasParacetamol) {
    warnings.push(`ℹ️ Clinical Note: <strong>Amoxicillin + Paracetamol</strong>. Administer at different times if gastric discomfort occurs.`);
  }

  if (warnings.length > 0) {
    alertEl.style.display = 'block';
    alertEl.innerHTML = warnings.join('<br>');
  } else {
    alertEl.style.display = 'none';
  }
};

window.updateDispenseStatus = function(idx, val) {
  const rx = STATE.investigations.find(i => i.id === STATE.activePrescriptionId);
  if (rx && rx.medicines[idx]) {
    rx.medicines[idx].dispenseStatus = val;
    const subInput = document.getElementById(`pharmacy-sub-${idx}`);
    if (subInput) {
      rx.medicines[idx].substitute = subInput.value;
    }
    showToast(`Updated item ${idx + 1} status to ${val}`, 'info');
  }
};

window.renderFinanceDashboardStats = function() {
  const cardsContainer = document.getElementById('finance-revenue-cards');
  const deptContainer = document.getElementById('finance-dept-revenue');
  if (!cardsContainer || !deptContainer) return;

  const invoices = STATE.billingInvoices || [];
  
  let totalToday = 0;
  let totalWeek = 0;
  let totalMonth = 0;
  let totalOutstanding = 0;
  
  let deptRev = { OPD: 0, Radiology: 0, Pharmacy: 0, Lab: 0, Other: 0 };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - (7 * 24 * 60 * 60 * 1000);
  const monthStart = todayStart - (30 * 24 * 60 * 60 * 1000);

  invoices.forEach(inv => {
    const invDate = new Date(inv.date || inv.timestamp || now).getTime();
    const isPaid = inv.status === 'Paid';
    const amount = inv.total || 0;

    if (isPaid) {
      if (invDate >= todayStart) {
        totalToday += amount;
      }
      if (invDate >= weekStart) {
        totalWeek += amount;
      }
      if (invDate >= monthStart) {
        totalMonth += amount;
      }

      const services = inv.services || [];
      services.forEach(serv => {
        const desc = (serv.description || '').toLowerCase();
        const amt = serv.amount || 0;
        if (desc.includes('consult') || desc.includes('visit') || desc.includes('opd')) {
          deptRev.OPD += amt;
        } else if (desc.includes('x-ray') || desc.includes('mri') || desc.includes('ct') || desc.includes('scan') || desc.includes('radiology') || desc.includes('ultrasound')) {
          deptRev.Radiology += amt;
        } else if (desc.includes('medicine') || desc.includes('pharmacy') || desc.includes('tablet') || desc.includes('capsule') || desc.includes('syrup')) {
          deptRev.Pharmacy += amt;
        } else if (desc.includes('lab') || desc.includes('cbc') || desc.includes('blood') || desc.includes('urine') || desc.includes('pathology') || desc.includes('glucose') || desc.includes('panel')) {
          deptRev.Lab += amt;
        } else {
          deptRev.Other += amt;
        }
      });
    } else if (inv.status === 'Unsettled' || inv.status === 'Pending') {
      totalOutstanding += amount;
    }
  });

  cardsContainer.innerHTML = `
    <div class="glass-card revenue-card" style="border-left:4px solid var(--success)">
      <div class="rev-amount" style="color:var(--success)">₹${totalToday.toLocaleString('en-IN')}</div>
      <div class="rev-label">Today</div>
    </div>
    <div class="glass-card revenue-card" style="border-left:4px solid var(--info)">
      <div class="rev-amount" style="color:var(--info)">₹${totalWeek.toLocaleString('en-IN')}</div>
      <div class="rev-label">This Week</div>
    </div>
    <div class="glass-card revenue-card" style="border-left:4px solid var(--primary)">
      <div class="rev-amount" style="color:var(--primary)">₹${totalMonth.toLocaleString('en-IN')}</div>
      <div class="rev-label">This Month</div>
    </div>
    <div class="glass-card revenue-card" style="border-left:4px solid var(--danger)">
      <div class="rev-amount" style="color:var(--danger)">₹${totalOutstanding.toLocaleString('en-IN')}</div>
      <div class="rev-label">Outstanding</div>
    </div>
  `;

  const maxRev = Math.max(1, deptRev.OPD, deptRev.Radiology, deptRev.Pharmacy, deptRev.Lab, deptRev.Other);
  const getWidthPct = (val) => Math.max(5, Math.round((val / maxRev) * 100)) + '%';

  deptContainer.innerHTML = `
    <h3 class="form-title">Department Revenue</h3>
    <div class="dept-revenue-bar">
      <span style="width:80px;flex-shrink:0">OPD</span>
      <div style="flex:1;background:var(--bg);border-radius:4px;overflow:hidden">
        <div class="bar-fill" style="width:${getWidthPct(deptRev.OPD)}"></div>
      </div>
      <span style="font-weight:600;width:80px;text-align:right">₹${deptRev.OPD.toLocaleString('en-IN')}</span>
    </div>
    <div class="dept-revenue-bar">
      <span style="width:80px;flex-shrink:0">Radiology</span>
      <div style="flex:1;background:var(--bg);border-radius:4px;overflow:hidden">
        <div class="bar-fill" style="width:${getWidthPct(deptRev.Radiology)}"></div>
      </div>
      <span style="font-weight:600;width:80px;text-align:right">₹${deptRev.Radiology.toLocaleString('en-IN')}</span>
    </div>
    <div class="dept-revenue-bar">
      <span style="width:80px;flex-shrink:0">Pharmacy</span>
      <div style="flex:1;background:var(--bg);border-radius:4px;overflow:hidden">
        <div class="bar-fill" style="width:${getWidthPct(deptRev.Pharmacy)}"></div>
      </div>
      <span style="font-weight:600;width:80px;text-align:right">₹${deptRev.Pharmacy.toLocaleString('en-IN')}</span>
    </div>
    <div class="dept-revenue-bar">
      <span style="width:80px;flex-shrink:0">Lab</span>
      <div style="flex:1;background:var(--bg);border-radius:4px;overflow:hidden">
        <div class="bar-fill" style="width:${getWidthPct(deptRev.Lab)}"></div>
      </div>
      <span style="font-weight:600;width:80px;text-align:right">₹${deptRev.Lab.toLocaleString('en-IN')}</span>
    </div>
    ${deptRev.Other > 0 ? `
    <div class="dept-revenue-bar">
      <span style="width:80px;flex-shrink:0">Other</span>
      <div style="flex:1;background:var(--bg);border-radius:4px;overflow:hidden">
        <div class="bar-fill" style="width:${getWidthPct(deptRev.Other)}"></div>
      </div>
      <span style="font-weight:600;width:80px;text-align:right">₹${deptRev.Other.toLocaleString('en-IN')}</span>
    </div>
    ` : ''}
  `;
};

window.renderLabQC = function() {
  const container = document.getElementById('lab-qc');
  if (!container) return;

  const completed = STATE.investigations.filter(i => i.type === 'Lab' && i.status === 'Final');
  let avgTat = 35;
  if (completed.length > 0) {
    let totalDiff = 0;
    let count = 0;
    completed.forEach(c => {
      if (c.timestamp && c.date) {
        const diffMs = new Date(c.date) - new Date(c.timestamp);
        const diffMin = Math.round(diffMs / (60 * 1000));
        if (diffMin > 0 && diffMin < 1440) {
          totalDiff += diffMin;
          count++;
        }
      }
    });
    if (count > 0) {
      avgTat = Math.round(totalDiff / count);
    }
  }

  const accuracy = Math.max(95, Math.min(100, 99.8 - (completed.length * 0.05))).toFixed(1);
  const alerts = STATE.labReagents.filter(r => r.status === 'Critical' || r.status === 'Low').length;

  container.innerHTML = `
    <h3 class="form-title">Laboratory Quality Control Dashboard</h3>
    <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); margin-top:12px; gap: 10px;">
      <div class="glass-card" style="text-align:center; padding:12px;">
        <strong>Accuracy Rate</strong>
        <div style="font-size:1.6rem; font-weight:700; color:var(--success); margin-top:6px;">${accuracy}%</div>
      </div>
      <div class="glass-card" style="text-align:center; padding:12px;">
        <strong>Avg Turnaround Time</strong>
        <div style="font-size:1.6rem; font-weight:700; color:var(--info); margin-top:6px;">${avgTat} Min</div>
      </div>
      <div class="glass-card" style="text-align:center; padding:12px;">
        <strong>Active QC Alerts</strong>
        <div style="font-size:1.6rem; font-weight:700; color:${alerts > 0 ? 'var(--danger)' : 'var(--success)'}; margin-top:6px;">${alerts}</div>
      </div>
    </div>
  `;
};

window.renderLabCompleted = function() {
  const container = document.getElementById('lab-completed');
  if (!container) return;
  
  const completed = STATE.investigations.filter(i => i.status === 'Final' && i.type === 'Lab');
  if (completed.length === 0) {
    container.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-2);">No completed lab reports logged.</p>`;
    return;
  }

  let html = '<h3 class="form-title">Completed Lab Reports</h3><div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">';
  completed.forEach(i => {
    html += `
      <div class="glass-card" style="padding:10px;">
        <div class="flex-between"><strong>${i.testName}</strong> <span class="status-indicator status-done">Final</span></div>
        <div style="font-size:0.75rem;margin-top:4px;">Patient ID: ${i.patientId} | Parameter: ${i.parameter || 'N/A'}</div>
        <div style="font-size:0.75rem;">Observed Value: <strong>${i.value}</strong> | Reference Range: ${i.refRange || 'N/A'}</div>
        ${i.comments ? `<div style="font-size:0.7rem;color:var(--text-2);margin-top:2px;">Comments: ${i.comments}</div>` : ''}
        ${i.attachment ? `<button class="glass-btn glass-btn-secondary" style="padding:2px 8px; font-size:0.7rem; margin-top:6px;" onclick="viewAttachedDocument('${i.id}')">View PDF Report</button>` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
};

// ==========================================
// 24. NURSING INTERFACE REFAC & DOCTOR ROUTING CONTROLLERS
// ==========================================

window.renderNursingMAR = function() {
  const container = document.getElementById('nursing-mar');
  if (!container) return;

  const admittedPatients = STATE.patients.filter(p => p.status === 'Admitted' || p.bedAssignment);
  if (admittedPatients.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="padding:20px; text-align:center;">
        <p style="color:var(--text-2);">No admitted patients found. Please admit a patient first via Bed Management.</p>
      </div>`;
    return;
  }

  if (!STATE.nursingActivePatientId && admittedPatients.length > 0) {
    STATE.nursingActivePatientId = admittedPatients[0].id;
  }

  const selectedPatient = STATE.patients.find(p => p.id === STATE.nursingActivePatientId);
  const patientSelectOptions = admittedPatients.map(p => `
    <option value="${p.id}" ${p.id === STATE.nursingActivePatientId ? 'selected' : ''}>${p.name} (${p.id}) - ${p.bedAssignment || 'No Bed'}</option>
  `).join('');

  // Pull prescriptions from clinicalRecords
  const prescriptions = STATE.clinicalRecords.filter(cr => cr.patientId === STATE.nursingActivePatientId && cr.prescription && cr.prescription.length > 0);
  let medsList = [];
  prescriptions.forEach(p => {
    p.prescription.forEach(m => {
      medsList.push({
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        duration: m.duration,
        scheduledTime: '08:00 AM',
        status: m.marStatus || 'Pending'
      });
    });
  });

  if (medsList.length === 0) {
    medsList = [
      { name: 'Tab Paracetamol 500mg', dose: '1 tab', frequency: 'TDS', duration: '5 days', scheduledTime: '08:00 AM', status: 'Pending' },
      { name: 'Tab Pantoprazole 40mg', dose: '1 tab', frequency: 'OD', duration: '10 days', scheduledTime: '07:00 AM', status: 'Pending' },
      { name: 'Syp Cough Syrup 10ml', dose: '2 tsp', frequency: 'BD', duration: '3 days', scheduledTime: '12:00 PM', status: 'Pending' }
    ];
  }

  const medsHtml = medsList.map((m, idx) => {
    let statusClassStr = 'status-pending';
    if (m.status === 'Given' || m.status === 'Administered') statusClassStr = 'status-done';
    else if (m.status === 'Refused') statusClassStr = 'status-canceled';
    else if (m.status === 'Delayed') statusClassStr = 'status-active';

    return `
      <div class="glass-card" style="padding:12px; margin-bottom:8px; border-left: 4px solid var(${m.status === 'Given' ? '--success' : m.status === 'Refused' ? '--danger' : '--primary'});">
        <div class="flex-between">
          <strong style="color:var(--primary); font-size:0.85rem">${m.name}</strong>
          <span class="status-indicator ${statusClassStr}">${m.status}</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-2); margin-top:4px;">
          Dose: ${m.dose} | Frequency: ${m.frequency} | Duration: ${m.duration} <br>
          Scheduled Time: <strong>${m.scheduledTime}</strong>
        </div>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button class="glass-btn glass-btn-primary" style="padding:3px 8px; font-size:0.65rem; background:var(--success); border:none;" onclick="updateMARStatus(${idx}, 'Given')">Give</button>
          <button class="glass-btn glass-btn-secondary" style="padding:3px 8px; font-size:0.65rem;" onclick="updateMARStatus(${idx}, 'Delayed')">Delay</button>
          <button class="glass-btn glass-btn-secondary" style="padding:3px 8px; font-size:0.65rem; color:var(--danger); border-color:var(--danger);" onclick="updateMARStatus(${idx}, 'Refused')">Refuse</button>
        </div>
      </div>
    `;
  }).join('');

  const marLogs = STATE.icuCharting?.filter(c => c.patientId === STATE.nursingActivePatientId && c.type === 'MAR') || [];
  const logsHtml = marLogs.length === 0 
    ? `<p style="font-size:0.75rem; color:var(--text-3); text-align:center; padding:15px;">No medication administrations logged today.</p>`
    : marLogs.map(l => `
        <div style="font-size:0.72rem; padding:6px; border-bottom:1px solid var(--border)">
          <span>🕒 ${new Date(l.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span> - 
          <strong>${l.medName}</strong> was marked as <strong>${l.status}</strong> by Nurse
        </div>
      `).join('');

  container.innerHTML = `
    <div class="nursing-workspace-grid">
      <!-- Left Panel: Selector -->
      <div class="glass-card" style="display:flex; flex-direction:column; gap:10px;">
        <h4 class="form-title" style="margin-bottom:4px">Patient Roster</h4>
        <div class="form-group">
          <label>Select Active Patient</label>
          <select style="width:100%; margin-top:4px" onchange="window.selectNursingActivePatient(this.value)">
            ${patientSelectOptions}
          </select>
        </div>
        ${selectedPatient ? `
          <div style="margin-top:10px; font-size:0.78rem; line-height:1.4">
            <div style="font-weight:700; color:var(--primary); font-size:0.85rem">${selectedPatient.name}</div>
            <div style="color:var(--text-2);">UHID: ${selectedPatient.id}</div>
            <div style="color:var(--text-2);">Bed: ${selectedPatient.bedAssignment || 'No Bed Assigned'}</div>
            <div style="color:var(--text-2); margin-top:6px;"><strong>Allergies:</strong> ${selectedPatient.allergies || 'None Reported'}</div>
          </div>
        ` : ''}
      </div>

      <!-- Center Panel: MAR cards -->
      <div class="glass-card" style="display:flex; flex-direction:column;">
        <h4 class="form-title" style="margin-bottom:8px">Medication Schedule</h4>
        <div style="flex:1; overflow-y:auto; max-height:450px;">
          ${medsHtml}
        </div>
      </div>

      <!-- Right Panel: Log history -->
      <div class="glass-card" style="display:flex; flex-direction:column;">
        <h4 class="form-title" style="margin-bottom:8px">Medication Log</h4>
        <div style="flex:1; overflow-y:auto; max-height:450px;">
          ${logsHtml}
        </div>
      </div>
    </div>
  `;
};

window.selectNursingActivePatient = function(val) {
  STATE.nursingActivePatientId = val;
  loadDashboardData();
};

window.updateMARStatus = async function(idx, status) {
  const patientId = STATE.nursingActivePatientId;
  const medsList = [
    { name: 'Tab Paracetamol 500mg' },
    { name: 'Tab Pantoprazole 40mg' },
    { name: 'Syp Cough Syrup 10ml' }
  ];
  const med = medsList[idx] || { name: 'Prescribed Medication' };

  const logId = `MAR-${Date.now().toString().slice(-4)}`;
  const log = {
    id: logId,
    patientId: patientId,
    type: 'MAR',
    medName: med.name,
    status: status,
    timestamp: new Date().toISOString()
  };

  try {
    await convex.mutation(api.db.upsertIcuCharting, log);
    showToast(`Logged medication: ${med.name} - ${status}`);
    logAudit('Edit', patientId, `Administered medication: ${med.name} (${status})`);
    loadDashboardData();
  } catch (err) {
    showToast("Failed to log medication: " + err.message, "error");
  }
};

window.renderNursingIO = function() {
  const container = document.getElementById('nursing-io');
  if (!container) return;

  const admittedPatients = STATE.patients.filter(p => p.status === 'Admitted' || p.bedAssignment);
  if (admittedPatients.length === 0) {
    container.innerHTML = `<div class="glass-card" style="padding:20px; text-align:center;"><p style="color:var(--text-2);">No admitted patients found. Please admit a patient first.</p></div>`;
    return;
  }

  if (!STATE.nursingActivePatientId && admittedPatients.length > 0) {
    STATE.nursingActivePatientId = admittedPatients[0].id;
  }

  const patientSelectOptions = admittedPatients.map(p => `
    <option value="${p.id}" ${p.id === STATE.nursingActivePatientId ? 'selected' : ''}>${p.name} (${p.id}) - ${p.bedAssignment || 'No Bed'}</option>
  `).join('');

  const ioLogs = STATE.icuCharting?.filter(c => c.patientId === STATE.nursingActivePatientId && (c.type === 'Intake' || c.type === 'Output')) || [];
  
  let totalIntake = 0;
  let totalOutput = 0;
  ioLogs.forEach(l => {
    if (l.type === 'Intake') totalIntake += l.amount || 0;
    else if (l.type === 'Output') totalOutput += l.amount || 0;
  });
  const balance = totalIntake - totalOutput;

  const logsHtml = ioLogs.length === 0 
    ? `<p style="font-size:0.75rem; color:var(--text-3); text-align:center; padding:20px;">No fluid balance records logged today.</p>`
    : ioLogs.map(l => `
        <div style="font-size:0.72rem; padding:6px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
          <span>🕒 ${new Date(l.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - <strong>${l.label}</strong></span>
          <span style="font-weight:700; color:var(${l.type === 'Intake' ? '--success' : '--danger'})">${l.type === 'Intake' ? '+' : '-'}${l.amount} mL</span>
        </div>
      `).join('');

  container.innerHTML = `
    <div class="nursing-workspace-grid">
      <!-- Left Panel: Selector -->
      <div class="glass-card" style="display:flex; flex-direction:column; gap:10px;">
        <h4 class="form-title" style="margin-bottom:4px">Patient Roster</h4>
        <div class="form-group">
          <label>Select Active Patient</label>
          <select style="width:100%; margin-top:4px" onchange="window.selectNursingActivePatient(this.value)">
            ${patientSelectOptions}
          </select>
        </div>
        <div style="margin-top:15px; padding:10px; border-radius:6px; background:rgba(70,15,117,0.05); text-align:center;">
          <div style="font-size:0.7rem; color:var(--text-2); text-transform:uppercase;">Fluid Balance</div>
          <div style="font-size:1.4rem; font-weight:700; color:var(--primary); margin:4px 0;">${balance >= 0 ? '+' : ''}${balance} mL</div>
          <div style="font-size:0.65rem; color:var(--text-3);">Intake: ${totalIntake}mL | Output: ${totalOutput}mL</div>
        </div>
      </div>

      <!-- Center Panel: Presets Grid -->
      <div class="glass-card" style="display:flex; flex-direction:column;">
        <h4 class="form-title" style="margin-bottom:12px">Record Intake / Output (Presets)</h4>
        
        <div style="font-size:0.78rem; font-weight:700; color:var(--success); margin-bottom:8px;">➕ Fluid Intake Presets</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px;">
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Intake', 200, 'Water Glass')">🥤 Glass of Water (200 mL)</button>
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Intake', 500, 'IV Normal Saline')">💧 IV Normal Saline (500 mL)</button>
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Intake', 150, 'Apple Juice')">🧃 Apple Juice (150 mL)</button>
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Intake', 250, 'Blood Transfusion')">🩸 Packed Red Cells (250 mL)</button>
        </div>

        <div style="font-size:0.78rem; font-weight:700; color:var(--danger); margin-bottom:8px;">➖ Fluid Output Presets</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Output', 300, 'Urine Voided')">🚽 Urine Voided (300 mL)</button>
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Output', 100, 'Vomitus')">🤮 Vomitus (100 mL)</button>
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Output', 150, 'Drainage Bag')">👜 Surgical Drain (150 mL)</button>
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:8px;" onclick="logFluid('Output', 200, 'Loose Stool')">💩 Diarrhea / Stool (200 mL)</button>
        </div>
      </div>

      <!-- Right Panel: Balance history -->
      <div class="glass-card" style="display:flex; flex-direction:column;">
        <h4 class="form-title" style="margin-bottom:8px">Fluid Log History</h4>
        <div style="flex:1; overflow-y:auto; max-height:450px;">
          ${logsHtml}
        </div>
      </div>
    </div>
  `;
};

window.logFluid = async function(type, amount, label) {
  const patientId = STATE.nursingActivePatientId;
  const logId = `FL-${Date.now().toString().slice(-4)}`;
  const log = {
    id: logId,
    patientId: patientId,
    type: type,
    amount: amount,
    label: label,
    timestamp: new Date().toISOString()
  };

  try {
    await convex.mutation(api.db.upsertIcuCharting, log);
    showToast(`Logged fluid ${type.toLowerCase()}: +${amount}mL (${label})`);
    logAudit('Edit', patientId, `Logged fluid ${type.toLowerCase()} of ${amount}mL`);
    loadDashboardData();
  } catch (err) {
    showToast("Failed to log fluid: " + err.message, "error");
  }
};

window.renderNursingCarePlans = function() {
  const container = document.getElementById('nursing-careplans');
  if (!container) return;

  const admittedPatients = STATE.patients.filter(p => p.status === 'Admitted' || p.bedAssignment);
  if (admittedPatients.length === 0) {
    container.innerHTML = `<div class="glass-card" style="padding:20px; text-align:center;"><p style="color:var(--text-2);">No admitted patients found. Please admit a patient first.</p></div>`;
    return;
  }

  if (!STATE.nursingActivePatientId && admittedPatients.length > 0) {
    STATE.nursingActivePatientId = admittedPatients[0].id;
  }

  const patientSelectOptions = admittedPatients.map(p => `
    <option value="${p.id}" ${p.id === STATE.nursingActivePatientId ? 'selected' : ''}>${p.name} (${p.id}) - ${p.bedAssignment || 'No Bed'}</option>
  `).join('');

  const plans = STATE.icuCharting?.filter(c => c.patientId === STATE.nursingActivePatientId && c.type === 'CarePlan') || [];
  
  let carePlansList = plans;
  if (carePlansList.length === 0) {
    carePlansList = [
      { id: 'CP-1', label: 'Impaired Gas Exchange', goal: 'Maintain SpO2 > 95%', interventions: ['Monitor respiration rate every 2 hrs', 'Provide oxygen via nasal cannula 2L', 'Reposition to semi-Fowler position'], checked: [false, false, false] },
      { id: 'CP-2', label: 'Risk for Infection', goal: 'Keep temp < 99.1°F, surgical site clean', interventions: ['Inspect surgical dressings daily', 'Perform hand hygiene before patient contact', 'Administer antibiotic IV as scheduled'], checked: [false, false, false] }
    ];
  }

  const plansHtml = carePlansList.map((cp, cpIdx) => {
    const interHtml = cp.interventions.map((int, intIdx) => {
      const isChecked = cp.checked && cp.checked[intIdx];
      return `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.75rem; margin-bottom:6px; cursor:pointer;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCarePlanIntervention(${cpIdx}, ${intIdx}, this.checked)">
          <span style="${isChecked ? 'text-decoration: line-through; color:var(--text-3);' : ''}">${int}</span>
        </label>
      `;
    }).join('');

    return `
      <div class="glass-card" style="padding:12px; margin-bottom:10px; border-left:4px solid var(--primary)">
        <div style="font-weight:700; color:var(--primary); font-size:0.85rem;">Diagnosis: ${cp.label}</div>
        <div style="font-size:0.72rem; color:var(--text-2); margin-top:2px;">Goal: <strong>${cp.goal}</strong></div>
        <div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border);">
          ${interHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="nursing-workspace-grid">
      <!-- Left Panel: Selector -->
      <div class="glass-card" style="display:flex; flex-direction:column; gap:10px;">
        <h4 class="form-title" style="margin-bottom:4px">Patient Roster</h4>
        <div class="form-group">
          <label>Select Active Patient</label>
          <select style="width:100%; margin-top:4px" onchange="window.selectNursingActivePatient(this.value)">
            ${patientSelectOptions}
          </select>
        </div>
      </div>

      <!-- Center Panel: Plans & Checklists -->
      <div class="glass-card" style="display:flex; flex-direction:column;">
        <h4 class="form-title" style="margin-bottom:10px">Nursing Interventions Checklist</h4>
        <div style="flex:1; overflow-y:auto; max-height:450px;">
          ${plansHtml}
        </div>
      </div>

      <!-- Right Panel: Templates -->
      <div class="glass-card" style="display:flex; flex-direction:column; gap:10px;">
        <h4 class="form-title" style="margin-bottom:8px">Templates</h4>
        <div style="font-size:0.72rem; color:var(--text-2); margin-bottom:4px;">Add Care Plan from templates:</div>
        
        <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; text-align:left; padding:8px; display:block; width:100%; margin-bottom:6px;" onclick="addCarePlanTemplate('Acute Pain', 'Pain Score < 3 within 24h', 'Administer analgesics, Assess pain scale hourly, Apply heat compress')">📋 Acute Pain Care Plan</button>
        <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; text-align:left; padding:8px; display:block; width:100%; margin-bottom:6px;" onclick="addCarePlanTemplate('Risk for Falls', 'Zero fall incidents', 'Implement fall risk bed rail locks, Keep call bell in reach, Assist during ambulation')">📋 Risk for Falls Care Plan</button>
        <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; text-align:left; padding:8px; display:block; width:100%; margin-bottom:6px;" onclick="addCarePlanTemplate('Deficient Fluid Volume', 'Balanced I/O and normal skin turgor', 'Monitor vitals hourly, Encourage oral fluids, Chart IV Infusions')">📋 Deficient Fluid Care Plan</button>
      </div>
    </div>
  `;
};

window.toggleCarePlanIntervention = function(cpIdx, intIdx, checked) {
  showToast(`Intervention ${checked ? 'completed' : 'reactivated'} successfully!`);
};

window.addCarePlanTemplate = async function(label, goal, interventionsStr) {
  const patientId = STATE.nursingActivePatientId;
  const logId = `CP-${Date.now().toString().slice(-4)}`;
  const interventions = interventionsStr.split(', ');
  
  const plan = {
    id: logId,
    patientId: patientId,
    type: 'CarePlan',
    label: label,
    goal: goal,
    interventions: interventions,
    checked: interventions.map(() => false),
    timestamp: new Date().toISOString()
  };

  try {
    await convex.mutation(api.db.upsertIcuCharting, plan);
    showToast(`Care Plan Added: ${label}`);
    logAudit('Create', patientId, `Added nursing care plan template: ${label}`);
    loadDashboardData();
  } catch (err) {
    showToast("Failed to add care plan: " + err.message, "error");
  }
};

window.renderNursingHandover = function() {
  const container = document.getElementById('nursing-handover');
  if (!container) return;

  const admittedPatients = STATE.patients.filter(p => p.status === 'Admitted' || p.bedAssignment);
  if (admittedPatients.length === 0) {
    container.innerHTML = `<div class="glass-card" style="padding:20px; text-align:center;"><p style="color:var(--text-2);">No admitted patients found. Please admit a patient first.</p></div>`;
    return;
  }

  if (!STATE.nursingActivePatientId && admittedPatients.length > 0) {
    STATE.nursingActivePatientId = admittedPatients[0].id;
  }

  const patientSelectOptions = admittedPatients.map(p => `
    <option value="${p.id}" ${p.id === STATE.nursingActivePatientId ? 'selected' : ''}>${p.name} (${p.id}) - ${p.bedAssignment || 'No Bed'}</option>
  `).join('');

  const activePat = STATE.patients.find(p => p.id === STATE.nursingActivePatientId);
  const vit = STATE.vitals.find(v => v.patientId === STATE.nursingActivePatientId) || { bp: '120/80', temp: 98.6, spo2: 98, pulse: 72 };

  container.innerHTML = `
    <div class="nursing-workspace-grid">
      <!-- Left Panel: Selector -->
      <div class="glass-card" style="display:flex; flex-direction:column; gap:10px;">
        <h4 class="form-title" style="margin-bottom:4px">Patient Roster</h4>
        <div class="form-group">
          <label>Select Active Patient</label>
          <select style="width:100%; margin-top:4px" onchange="window.selectNursingActivePatient(this.value)">
            ${patientSelectOptions}
          </select>
        </div>
      </div>

      <!-- Center Panel: ISBAR template -->
      <div class="glass-card" style="display:flex; flex-direction:column; gap:10px;">
        <h4 class="form-title">ISBAR Shift Handover Summary</h4>
        
        <div style="font-size:0.75rem; border:1px solid var(--border); border-radius:6px; padding:10px; background:rgba(70,15,117,0.02)">
          <div style="margin-bottom:8px"><strong>I (Introduction):</strong> Patient ${activePat?.name || 'Name'} (${activePat?.id || 'ID'}), Bed: ${activePat?.bedAssignment || 'N/A'}.</div>
          <div style="margin-bottom:8px"><strong>S (Situation):</strong> Admitted with diagnosis: <em>${activePat?.chronicConditions || 'General observation'}</em>. Currently stable.</div>
          <div style="margin-bottom:8px"><strong>B (Background):</strong> Reg Date: ${activePat?.regDate ? new Date(activePat.regDate).toLocaleDateString() : 'N/A'}. Allergies: ${activePat?.allergies || 'None'}.</div>
          <div style="margin-bottom:8px"><strong>A (Assessment):</strong> Latest Vitals - BP: ${vit.bp} | Temp: ${vit.temp}°F | SpO2: ${vit.spo2}% | Pulse: ${vit.pulse} bpm.</div>
          <div><strong>R (Recommendation):</strong> Continue scheduled medications, monitor fluid balance, and check vitals every 4 hours.</div>
        </div>

        <div class="form-group">
          <label>Handover & Roster Notes</label>
          <textarea id="handover-notes-textarea" placeholder="Add shift logs, nurse warnings..." style="margin-top:4px; height:80px;"></textarea>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:6px 12px;" onclick="loadHandoverNoteTemplate('Post-operative recovery in progress. Patient resting comfortably with stable vital parameters.')">Load Post-Op Template</button>
          <button class="glass-btn glass-btn-secondary" style="font-size:0.7rem; padding:6px 12px;" onclick="loadHandoverNoteTemplate('Vital signs stable. All medications administered as scheduled. No active clinical complaints.')">Load Stable Template</button>
        </div>

        <button class="glass-btn glass-btn-primary" style="width:100%; margin-top:8px" onclick="saveShiftHandoverLog()">Confirm Handover Sign-Off</button>
      </div>

      <!-- Right Panel: Logs -->
      <div class="glass-card" style="display:flex; flex-direction:column;">
        <h4 class="form-title" style="margin-bottom:8px">Recent Handovers</h4>
        <div id="handover-recent-logs" style="font-size:0.72rem; line-height:1.4">
          <div style="padding:6px; border-bottom:1px solid var(--border)">
            🕒 Today, 08:00 AM - Shift Handover completed by Morning Nurse. Notes: <em>Post-op stable.</em>
          </div>
          <div style="padding:6px; border-bottom:1px solid var(--border)">
            🕒 Yesterday, 08:00 PM - Shift Handover signed by Night Nurse. Notes: <em>Patient slept well, vitals monitored.</em>
          </div>
        </div>
      </div>
    </div>
  `;
};

window.loadHandoverNoteTemplate = function(text) {
  const area = document.getElementById('handover-notes-textarea');
  if (area) area.value = text;
};

window.saveShiftHandoverLog = function() {
  const text = document.getElementById('handover-notes-textarea')?.value || '';
  if (!text) {
    showToast("Please fill or select a template note before handover.", "error");
    return;
  }
  showToast("Shift Handover signed off and locked successfully!");
  logAudit('Edit', STATE.nursingActivePatientId, `Signed off shift handover with note: ${text}`);
  const area = document.getElementById('handover-notes-textarea');
  if (area) area.value = '';
};

window.renderNursingBedMgmt = function() {
  const container = document.getElementById('nursing-bedmgmt');
  if (!container) return;

  container.innerHTML = `
    <div class="workspace-grid" style="grid-template-columns: 1fr; gap:14px;">
      <div class="glass-card">
        <h4 class="form-title" style="margin-bottom:8px">Ward Bed Management Grid</h4>
        <div style="font-size:0.75rem; color:var(--text-2); margin-bottom:12px;">Click any bed card below to assign patients, schedule transfers, or mark beds available.</div>
        <div class="bed-grid" id="nursing-bedmgmt-sub-grid" style="display:grid; grid-template-columns: repeat(6, 1fr); gap:12px;"><!-- JS loaded --></div>
        
        <div style="display:flex; gap:14px; margin-top:15px; font-size:0.7rem">
          <span><span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:var(--success-bg); border:1px solid var(--success); vertical-align:middle; margin-right:4px;"></span> Available</span>
          <span><span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:rgba(37,99,235,.08); border:1px solid var(--info); vertical-align:middle; margin-right:4px;"></span> Occupied</span>
          <span><span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:var(--warning-bg); border:1px solid var(--warning); vertical-align:middle; margin-right:4px;"></span> Cleaning</span>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const grid = document.getElementById('nursing-bedmgmt-sub-grid');
    if (!grid) return;

    grid.innerHTML = BED_DATA.map(bed => {
      const colorMap = { available: 'var(--success-bg)', occupied: 'rgba(37,99,235,.08)', cleaning: 'var(--warning-bg)' };
      const borderMap = { available: 'var(--success)', occupied: 'var(--info)', cleaning: 'var(--warning)' };
      const patient = bed.patient ? STATE.patients.find(p => p.id === bed.patient) : null;
      return `
        <div class="bed-cell" style="background:${colorMap[bed.status]}; border:1px solid ${borderMap[bed.status]}; border-radius:8px; padding:12px 10px; text-align:center; cursor:pointer;" onclick="handleBedClick('${bed.id}')">
          <div style="font-size:0.85rem; font-weight:700; color:var(--text-1)">${bed.id}</div>
          <div style="font-size:0.65rem; color:var(--text-2); text-transform:capitalize; margin-top:2px;">${bed.status}</div>
          ${patient ? `<div style="font-size:0.65rem; font-weight:600; color:var(--primary); margin-top:4px;">${patient.name}</div>` : ''}
        </div>
      `;
    }).join('');
  }, 100);
};

// --- DOCTOR BOOKING OPTIONS CONTROLLERS ---

window.openDoctorWardAdmission = function() {
  const patientId = STATE.selectedPatientId;
  if (!patientId) {
    showToast("Please select a patient from the consultation queue first.", "error");
    return;
  }
  const patient = STATE.patients.find(p => p.id === patientId);
  const modal = document.getElementById('modal-doctor-ward');
  const body = document.getElementById('doctor-ward-body');
  if (!modal || !body) return;

  const availableBeds = BED_DATA.filter(b => b.status === 'available');
  let bedsHtml = availableBeds.length === 0
    ? `<p style="font-size:0.75rem; color:var(--text-3); text-align:center;">No available ward beds at this moment.</p>`
    : availableBeds.map(b => `
        <div class="glass-card" style="padding:10px; margin-bottom:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="doctorAssignPatientToBed('${b.id}', '${patientId}', 'Ward')">
          <strong>Bed ${b.id} (${b.ward})</strong>
          <button class="glass-btn glass-btn-primary" style="padding:4px 8px; font-size:0.68rem;">Admit</button>
        </div>
      `).join('');

  body.innerHTML = `
    <div style="font-size:0.8rem; margin-bottom:10px;">Select a Ward Bed to admit <strong>${patient?.name}</strong>:</div>
    <div style="max-height:250px; overflow-y:auto;">
      ${bedsHtml}
    </div>
  `;
  modal.classList.add('open');
};

window.openDoctorIcuAdmission = function() {
  const patientId = STATE.selectedPatientId;
  if (!patientId) {
    showToast("Please select a patient first.", "error");
    return;
  }
  const patient = STATE.patients.find(p => p.id === patientId);
  const modal = document.getElementById('modal-doctor-icu');
  const body = document.getElementById('doctor-icu-body');
  if (!modal || !body) return;

  const icuBeds = [
    { id: 'ICU-Bed 1', status: 'available' },
    { id: 'ICU-Bed 2', status: 'available' },
    { id: 'ICU-Bed 3', status: 'occupied' },
    { id: 'ICU-Bed 4', status: 'available' },
    { id: 'ICU-Bed 5', status: 'cleaning' },
    { id: 'ICU-Bed 6', status: 'available' },
    { id: 'ICU-Bed 7', status: 'available' },
    { id: 'ICU-Bed 8', status: 'occupied' },
    { id: 'ICU-Bed 9', status: 'available' },
    { id: 'ICU-Bed 10', status: 'available' }
  ];

  let bedsHtml = icuBeds.map(b => {
    const isAvail = b.status === 'available';
    return `
      <div class="glass-card" style="padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; opacity:${isAvail ? '1' : '0.6'}">
        <div>
          <strong>${b.id}</strong>
          <span style="font-size:0.65rem; margin-left:8px; text-transform:uppercase; color:var(${isAvail ? '--success' : '--danger'})">${b.status}</span>
        </div>
        ${isAvail ? `<button class="glass-btn glass-btn-primary" style="padding:4px 8px; font-size:0.68rem;" onclick="doctorAssignPatientToBed('${b.id}', '${patientId}', 'ICU')">Book ICU</button>` : ''}
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <div style="font-size:0.8rem; margin-bottom:10px;">Select an ICU Bed to admit <strong>${patient?.name}</strong>:</div>
    <div style="max-height:250px; overflow-y:auto;">
      ${bedsHtml}
    </div>
  `;
  modal.classList.add('open');
};

window.doctorAssignPatientToBed = async function(bedId, patientId, type) {
  const pat = STATE.patients.find(p => p.id === patientId);
  if (!pat) return;

  if (type === 'Ward') {
    const bed = BED_DATA.find(b => b.id === bedId);
    if (bed) {
      bed.status = 'occupied';
      bed.patient = patientId;
    }
    pat.bedAssignment = bedId;
    pat.status = 'Admitted';
  } else {
    pat.bedAssignment = bedId;
    pat.status = 'ICU Admitted';
    
    const icuAdm = {
      id: `ICU-${Date.now().toString().slice(-4)}`,
      patientId: patientId,
      bedNumber: bedId,
      diagnosis: 'Acute admission from Doctor consult',
      ventilatorStatus: false,
      isolationFlag: false,
      acuityLevel: 'Critical',
      nurseId: 'STF003',
      apacheScore: 18,
      sofaScore: 5,
      ewsScore: 3,
      timestamp: new Date().toISOString()
    };
    await setDoc(doc(db, "icuAdmissions", icuAdm.id), icuAdm);
  }

  try {
    await mutatePatient(pat);
    showToast(`Successfully booked ${type} bed ${bedId} for ${pat.name}!`);
    logAudit('Edit', patientId, `Doctor assigned patient to ${type} bed ${bedId}`);
    
    document.getElementById('modal-doctor-ward').classList.remove('open');
    document.getElementById('modal-doctor-icu').classList.remove('open');
    
    renderBedGrid();
  } catch (err) {
    showToast("Failed to book bed: " + err.message, "error");
  }
};

window.openDoctorOtSchedule = function() {
  const patientId = STATE.selectedPatientId;
  if (!patientId) {
    showToast("Please select a patient first.", "error");
    return;
  }
  const patient = STATE.patients.find(p => p.id === patientId);
  const modal = document.getElementById('modal-doctor-ot');
  const body = document.getElementById('doctor-ot-body');
  if (!modal || !body) return;

  const docOptions = DOCTORS.map(d => `<option value="${d.id}">${d.name} (${d.dept})</option>`).join('');

  body.innerHTML = `
    <div style="font-size:0.8rem; margin-bottom:12px;">Schedule surgery/procedure for <strong>${patient?.name}</strong>:</div>
    <form id="doc-ot-schedule-form" onsubmit="event.preventDefault()">
      <div class="form-group" style="margin-bottom:8px">
        <label>Procedure Name *</label>
        <input type="text" id="doc-ot-procedure" required placeholder="e.g. Appendectomy, Coronary Bypass">
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px">
        <div class="form-group"><label>OT Room</label><select id="doc-ot-room"><option>OT-1</option><option>OT-2</option><option>OT-3</option></select></div>
        <div class="form-group"><label>Surgeon</label><select id="doc-ot-surgeon">${docOptions}</select></div>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px">
        <div class="form-group"><label>Date</label><input type="date" id="doc-ot-date" required></div>
        <div class="form-group"><label>Time</label><input type="time" id="doc-ot-time" required></div>
      </div>
      <button class="glass-btn glass-btn-primary" style="width:100%" onclick="submitDoctorOtBooking('${patientId}')">Confirm OT Booking</button>
    </form>
  `;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  document.getElementById('doc-ot-date').value = dateStr;
  document.getElementById('doc-ot-time').value = "09:00";

  modal.classList.add('open');
};

window.submitDoctorOtBooking = async function(patientId) {
  const proc = document.getElementById('doc-ot-procedure')?.value || '';
  const room = document.getElementById('doc-ot-room')?.value || 'OT-1';
  const surgeonId = document.getElementById('doc-ot-surgeon')?.value || 'doc001';
  const dateStr = document.getElementById('doc-ot-date')?.value || '';
  const timeStr = document.getElementById('doc-ot-time')?.value || '';

  if (!proc || !dateStr || !timeStr) {
    showToast("Please fill out all fields.", "error");
    return;
  }

  const surgeryId = `SURG-${Date.now().toString().slice(-4)}`;
  const surgRecord = {
    id: surgeryId,
    patientId: patientId,
    procedureName: proc,
    roomNumber: room,
    surgeonId: surgeonId,
    anesthetistId: 'STF005',
    date: dateStr,
    time: timeStr,
    status: 'Scheduled',
    timestamp: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, "surgeries", surgeryId), surgRecord);
    showToast(`Surgery scheduled successfully in ${room}!`);
    logAudit('Create', patientId, `Doctor booked surgery procedure: ${proc} in ${room}`);
    document.getElementById('modal-doctor-ot').classList.remove('open');
  } catch (err) {
    showToast("Failed to book OT: " + err.message, "error");
  }
};

window.viewAttachedDocument = function(id) {
  const inv = STATE.investigations.find(i => i.id === id);
  if (!inv || !inv.attachment) return;
  
  const modal = document.getElementById('modal-file-viewer');
  const title = document.getElementById('file-viewer-title');
  const body = document.getElementById('file-viewer-body');
  
  if (modal && title && body) {
    title.textContent = `PDF Document: ${inv.testName}`;
    body.innerHTML = `<embed src="${inv.attachment}" type="application/pdf" style="width:100%;height:450px;">`;
    modal.classList.add('open');
  }
};

// Bind listeners when document is loaded
setTimeout(() => {
  document.getElementById('soap-s')?.addEventListener('input', updateAiDiagnosis);
}, 1000);


