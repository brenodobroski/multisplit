/**
 * GESTOR MULTISPLIT ENTERPRISE v6.5 (EXCEL REPORTING SUITE - RESTORED)
 * ==================================================================================
 * Versão Restaurada (v6.5):
 * - Funcionalidade de Exportação de Relatório (Excel) mantida.
 * - Meses fixos (Set/Out/Nov) conforme versão anterior.
 * - Cálculo de Crescimento e Auto-Faturamento mantidos.
 * ==================================================================================
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { 
  LayoutDashboard, Package, TrendingUp, BarChart3, Calendar as CalendarIcon, Upload, Database, 
  ArrowUpRight, ArrowDownRight, Building2, Search, Plus, Trash2, CalendarCheck, 
  LogOut, CheckCircle, ArrowLeft, ChevronRight, CalendarDays, X, Lock, 
  User as UserIcon, ArrowRight, Info, Barcode, Check, PieChart, Filter, 
  Layers, Search as SearchIcon, Box, AlertTriangle, Bell, Settings, 
  FileText, Truck, Activity, Menu, ChevronDown, Download, RefreshCw,
  ClipboardList, Shield, UserCog, History, Fan, Snowflake, Ship, FileCheck, ChevronLeft,
  MoreHorizontal, Clock, EyeOff, LayoutGrid, List, DollarSign, Trophy, Zap, FileDown
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, signInAnonymously, signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, 
  serverTimestamp, writeBatch, setDoc, getDoc, query, orderBy, limit, where, getDocs
} from 'firebase/firestore';

/* ==================================================================================
 * 1. CONFIGURAÇÃO FIREBASE
 * ================================================================================== */

let firebaseConfig;
try {
  firebaseConfig = JSON.parse(__firebase_config);
} catch (e) {
  firebaseConfig = { apiKey: "AIzaSyBHT9AJm1R1bbfpmZsnAlaeBGTJipxCkQ0",
  authDomain: "pedidos-multisplit.firebaseapp.com",
  projectId: "pedidos-multisplit",
  storageBucket: "pedidos-multisplit.firebasestorage.app",
  messagingSenderId: "219345312208",
  appId: "1:219345312208:web:34926e6db9555c57f601d5" };
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'multisplit-enterprise-default';

const ALLOWED_BRANDS = ['DAIKIN', 'ELGIN', 'FUJITSU', 'GREE', 'LG', 'SAMSUNG', 'MIDEA'];

const BRAND_ASSETS = {
  'SAMSUNG': { logo: 'https://logo.clearbit.com/samsung.com', color: 'blue' },
  'LG': { logo: 'https://logo.clearbit.com/lg.com', color: 'rose' },
  'MIDEA': { logo: 'https://logo.clearbit.com/midea.com', color: 'cyan' },
  'DAIKIN': { logo: 'https://logo.clearbit.com/daikin.com', color: 'sky' },
  'GREE': { logo: 'https://logo.clearbit.com/gree.com', color: 'emerald' },
  'FUJITSU': { logo: 'https://logo.clearbit.com/fujitsu-general.com', color: 'red' },
  'ELGIN': { logo: 'https://logo.clearbit.com/elgin.com.br', color: 'orange' }
};

/* ==================================================================================
 * 2. UTILITÁRIOS
 * ================================================================================== */
const normalizeSKU = (sku) => {
  if (!sku) return '';
  return String(sku).trim().toUpperCase().replace(/[\s\uFEFF\xA0]+/g, ''); 
};

const parseExcelDate = (value) => {
  if (!value) return null;
  if (typeof value === 'number' && value > 20000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    const timezoneOffset = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() + timezoneOffset);
  }
  if (typeof value === 'string') {
    const ptDate = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (ptDate) return new Date(`${ptDate[3]}-${ptDate[2]}-${ptDate[1]}`);
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) return isoDate;
  }
  return null;
};

const Formatters = {
  currency: (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val),
  number: (val) => new Intl.NumberFormat('pt-BR').format(val),
  decimal: (val) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val),
  percent: (val) => new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(val),
  date: (val) => {
    if (!val) return '-';
    let d = val;
    if (!(d instanceof Date)) d = new Date(val);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '-'; 
    return d.toLocaleDateString('pt-BR');
  },
  parseMoney: (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let clean = val.toString().replace(/[R$\s]/g, '').trim();
    if (clean.includes(',') && !clean.includes('.')) clean = clean.replace(',', '.');
    else if (clean.includes('.') && clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }
};

const findColumnValue = (row, possibleKeys) => {
  const normalize = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const rowKeys = Object.keys(row);
  for (const key of possibleKeys) {
    const foundKey = rowKeys.find(rk => normalize(rk).includes(normalize(key)));
    if (foundKey) return row[foundKey];
  }
  return null;
};

/* ==================================================================================
 * 3. UI COMPONENTS
 * ================================================================================== */

const ToastContext = createContext();
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 4000);
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));
  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded border shadow-lg text-sm font-medium animate-slideIn ${t.type === 'success' ? 'bg-emerald-700 text-white border-emerald-800' : t.type === 'error' ? 'bg-red-700 text-white border-red-800' : 'bg-slate-800 text-white border-slate-900'}`}>
            {t.type === 'success' ? <CheckCircle className="w-4 h-4"/> : t.type === 'error' ? <AlertTriangle className="w-4 h-4"/> : <Zap className="w-4 h-4"/>}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
const useToast = () => useContext(ToastContext);

const Card = ({ children, className = "", onClick, hoverable = false }) => (
  <div onClick={onClick} className={`bg-white border border-slate-200 rounded-md shadow-sm ${hoverable ? 'hover:border-blue-500 cursor-pointer transition-colors' : ''} ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', size = 'md', icon: Icon, disabled = false, fullWidth = false, className = "" }) => {
  const variants = {
    primary: "bg-blue-700 hover:bg-blue-800 text-white border border-transparent shadow-sm",
    secondary: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-300",
    danger: "bg-white text-red-700 hover:bg-red-50 border border-red-200",
    black: "bg-slate-800 text-white hover:bg-slate-900 border border-transparent",
    ghost: "text-slate-600 hover:bg-slate-100 border-transparent",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent",
    purple: "bg-purple-600 text-white hover:bg-purple-700 border border-transparent"
  };
  const sizes = { xs: "px-2 py-1 text-xs", sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-2.5 text-sm" };
  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-2 font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}>
      {Icon && <Icon className="w-4 h-4" />} {children}
    </button>
  );
};

const InputField = ({ label, type = "text", value, onChange, placeholder, icon: Icon }) => (
  <div className="space-y-1">
    {label && <label className="block text-xs font-bold text-slate-700">{label}</label>}
    <div className="relative group">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={`w-full bg-white border border-slate-300 rounded-md py-2 ${Icon ? 'pl-9' : 'pl-3'} pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all`} />
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const config = { 
    pendente: "bg-amber-50 text-amber-700 border-amber-200", 
    parcial: "bg-blue-50 text-blue-700 border-blue-200", 
    faturado: "bg-emerald-50 text-emerald-700 border-emerald-200", 
    agendado: "bg-purple-50 text-purple-700 border-purple-200"
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${config[status] || config.pendente}`}>{status}</span>;
};

const Modal = ({ isOpen, onClose, title, children, size = "md", actions }) => {
  if (!isOpen) return null;
  const sizes = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className={`bg-white rounded-lg shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn border border-slate-200`}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-slate-800" /></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">{children}</div>
        {actions && <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
};

/* ==================================================================================
 * 4. MÓDULOS
 * ================================================================================== */

// --- 4.1: LOGIN ---
const LoginModule = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try { await signInWithEmailAndPassword(auth, email, password); } catch (err) { setError('Credenciais inválidas.'); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-blue-800 rounded-lg flex items-center justify-center mb-4 shadow-lg shadow-blue-900/20"><Activity className="w-6 h-6 text-white"/></div>
          <h2 className="text-xl font-bold text-slate-900">Climario Enterprise</h2>
          <p className="text-slate-500 text-xs font-medium">Painel Administrativo</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-xs font-semibold p-3 rounded border border-red-100 flex items-center gap-2"><AlertTriangle className="w-3 h-3"/>{error}</div>}
          <InputField label="Email Corporativo" icon={UserIcon} value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@empresa.com" />
          <InputField label="Senha" icon={Lock} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          <Button fullWidth variant="primary" size="md" disabled={loading} className="mt-2">{loading ? 'Autenticando...' : 'Acessar Sistema'}</Button>
        </form>
      </div>
    </div>
  );
};

// --- 4.2: AGENDA (FILTRO RIGOROSO) ---
const DeliverySchedule = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transitData, setTransitData] = useState([]);
  const [matrixMap, setMatrixMap] = useState({});

  useEffect(() => {
    const unsubTransit = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'bi_analytics', 'transit_store'), (s) => {
      if(s.exists()) {
        const raw = s.data().data || {};
        setTransitData(Object.entries(raw).map(([sku, val]) => ({ sku: normalizeSKU(sku), ...val })));
      }
    });
    const unsubMatrix = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'bi_analytics', 'matrix'), (s) => {
      if(s.exists()) {
        const map = {};
        (s.data().rows || []).forEach(r => map[normalizeSKU(r.code)] = r.desc);
        setMatrixMap(map);
      }
    });
    return () => { unsubTransit(); unsubMatrix(); };
  }, []);

  const eventsByDate = useMemo(() => {
    const map = {};
    transitData.forEach(item => {
      if (item.date && item.qty > 0 && matrixMap[item.sku]) {
        if (!map[item.date]) map[item.date] = [];
        map[item.date].push({ ...item, desc: matrixMap[item.sku] });
      }
    });
    return map;
  }, [transitData, matrixMap]);

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(year, month, i + 1);
      const dateStr = d.toISOString().split('T')[0];
      return { date: d, dateStr, events: eventsByDate[dateStr] || [] };
    });
  }, [currentDate, eventsByDate]);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Calendário de Recebimento</h2>
          <p className="text-slate-500 text-xs font-medium">Visão mensal de entregas programadas</p>
        </div>
        <div className="flex items-center gap-2 border border-slate-300 rounded-md bg-white p-1">
          <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded text-slate-600"><ChevronLeft className="w-4 h-4"/></button>
          <span className="font-bold text-slate-800 w-32 text-center text-sm uppercase tracking-wide">
            {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded text-slate-600"><ChevronRight className="w-4 h-4"/></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {daysInMonth.map((day) => (
          <Card key={day.dateStr} className={`p-3 flex flex-col h-48 transition-all ${day.events.length > 0 ? 'border-blue-300 ring-1 ring-blue-100 shadow-sm' : 'border-slate-200 bg-slate-50/30'}`}>
            <div className="flex justify-between items-start mb-2 border-b border-slate-100 pb-2">
              <span className={`text-xl font-bold ${day.events.length > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{day.date.getDate()}</span>
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">{day.date.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5">
              {day.events.length > 0 ? day.events.map((ev, idx) => (
                <div key={idx} className="bg-white p-2 rounded border border-slate-200 shadow-sm text-[10px]">
                  <div className="font-bold text-slate-800 truncate mb-0.5" title={ev.desc}>{ev.desc}</div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="font-mono font-semibold">{ev.sku}</span>
                    <span className="font-bold text-blue-700 bg-blue-50 px-1.5 rounded border border-blue-100">{ev.qty} un</span>
                  </div>
                </div>
              )) : <div className="h-full flex flex-col items-center justify-center text-slate-300 text-xs italic">Sem entregas</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// --- 4.3: DASHBOARD BI (Export & Fixed Months) ---
const BIDashboard = ({ user }) => {
  const { addToast } = useToast();
  const [data, setData] = useState([]);
  const [transitData, setTransitData] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewBrand, setViewBrand] = useState(null);
  const [activeTab, setActiveTab] = useState('conds');
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL');
  const [hideZeroSales, setHideZeroSales] = useState(false);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState({ filename: 'relatorio_vendas', includeZero: false });

  const matrixFileRef = useRef(null);
  const transitFileRef = useRef(null);

  useEffect(() => {
    const unsubMatrix = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'bi_analytics', 'matrix'), (s) => {
        if(s.exists()) setData(s.data().rows || []);
        setLoading(false);
      });
    const unsubTransit = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'bi_analytics', 'transit_store'), (s) => {
        if(s.exists()) setTransitData(s.data().data || {});
      });
    return () => { unsubMatrix(); unsubTransit(); };
  }, []);

  const processMatrixUpload = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = window.XLSX; const wb = XLSX.read(evt.target.result, {type:'binary'});
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const processed = json.map(row => {
           const desc = String(findColumnValue(row, ['Descrição', 'Descricao', 'Produto']) || '').toUpperCase();
           let brand = 'OUTRA';
           for(const b of ALLOWED_BRANDS) if(desc.includes(b)) { brand = b; break; }
           if(desc.includes('SPRINGER') && brand === 'OUTRA') brand = 'MIDEA';
           
           let type = 'Outros';
           if(desc.includes('COND') || desc.includes('EXTERNA')) type = 'Condensadora';
           else if(desc.includes('EVAP') || desc.includes('INTERNA')) type = 'Evaporadora';

           return {
             code: normalizeSKU(findColumnValue(row, ['Código', 'Codigo', 'SKU'])),
             desc, brand, type,
             factory: String(findColumnValue(row, ['Fábrica', 'Ref']) || '').toUpperCase(),
             sales25: Formatters.parseMoney(findColumnValue(row, ['2025', 'Vendas 25', 'Total 25'])),
             sales24: Formatters.parseMoney(findColumnValue(row, ['2024', 'Vendas 2024', 'Total 2024', 'Vendas 24', '24'])), 
             out: Formatters.parseMoney(findColumnValue(row, ['Out', 'Outubro'])),
             nov: Formatters.parseMoney(findColumnValue(row, ['Nov', 'Novembro'])),
             stock: Formatters.parseMoney(findColumnValue(row, ['Disp', 'Estoque', 'Saldo'])),
             ago: Formatters.parseMoney(findColumnValue(row, ['Ago', 'Agosto'])),
             set: Formatters.parseMoney(findColumnValue(row, ['Set', 'Setembro']))
           };
        });
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bi_analytics', 'matrix'), { rows: processed, updatedAt: serverTimestamp() });
        addToast(`${processed.length} produtos atualizados.`, 'success');
      } catch(err) { console.error(err); addToast("Erro planilha.", 'error'); }
    };
    reader.readAsBinaryString(file);
  };

  const processTransitUpload = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const XLSX = window.XLSX; const wb = XLSX.read(evt.target.result, {type:'binary'});
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const transitMap = {};
        const incomingSKUs = new Set();

        json.forEach(r => {
           const sku = normalizeSKU(findColumnValue(r, ['Cod. Produto', 'SKU', 'Código']));
           const qty = parseInt(findColumnValue(r, ['Quantidade', 'Qtd'])) || 0;
           const rawDate = findColumnValue(r, ['Previsão', 'Data']);
           const parsedDate = parseExcelDate(rawDate);
           const dateStr = parsedDate ? parsedDate.toISOString().split('T')[0] : null;
           
           if(sku && sku.length > 2 && qty > 0 && qty < 99999) { 
             if(!transitMap[sku]) transitMap[sku] = { qty: 0, date: null };
             transitMap[sku].qty += qty;
             if(dateStr && (!transitMap[sku].date || dateStr < transitMap[sku].date)) transitMap[sku].date = dateStr;
             incomingSKUs.add(sku);
           }
        });

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bi_analytics', 'transit_store'), { data: transitMap, updatedAt: serverTimestamp() });
        
        const ordersRef = collection(db, 'artifacts', appId, 'users', user.uid, 'multisplit_orders');
        const q = query(ordersRef, where('status', '!=', 'faturado'));
        const querySnapshot = await getDocs(q);
        
        let updatedOrdersCount = 0;
        let autoInvoicedItemsCount = 0;

        for (const docSnapshot of querySnapshot.docs) {
           const orderData = docSnapshot.data();
           let orderChanged = false;
           let newItems = [...orderData.items];

           newItems = newItems.map(item => {
              const cleanSku = normalizeSKU(item.sku);
              if (incomingSKUs.has(cleanSku)) {
                 if ((item.invoiced || 0) < item.qty) {
                    const alreadyInvoiced = item.invoiced || 0;
                    const needed = item.qty - alreadyInvoiced;
                    if (needed > 0) {
                       orderChanged = true;
                       autoInvoicedItemsCount++;
                       return {
                          ...item,
                          invoiced: item.qty,
                          scheduled: 0,
                          history: [...(item.history || []), { 
                             type: 'Auto-Faturado (Trânsito)', 
                             qty: needed, 
                             date: new Date().toISOString().split('T')[0] 
                          }]
                       };
                    }
                 }
              }
              return item;
           });

           if (orderChanged) {
              updatedOrdersCount++;
              const totalQty = newItems.reduce((acc, i) => acc + i.qty, 0);
              const totalInv = newItems.reduce((acc, i) => acc + (i.invoiced || 0), 0);
              const newStatus = totalInv >= totalQty ? 'faturado' : 'parcial';
              await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'multisplit_orders', docSnapshot.id), { items: newItems, status: newStatus });
           }
        }

        addToast(`Agendamento processado.`, 'success');
        if (autoInvoicedItemsCount > 0) {
           setTimeout(() => addToast(`⚡ Auto-Faturamento: ${autoInvoicedItemsCount} itens baixados.`, 'success'), 1000);
        }

      } catch(err) { console.error(err); addToast("Erro Agendamento.", 'error'); }
    };
    reader.readAsBinaryString(file);
  };

  const enrichedData = useMemo(() => {
    return data.map(item => {
       const transitInfo = transitData[normalizeSKU(item.code)] || { qty: 0, date: null };
       const transitDate = transitInfo.date ? new Date(transitInfo.date + 'T12:00:00') : null; 
       
       // Meses FIXOS
       const currentMonthSales = item.nov || 0;
       const previousMonthSales = item.out || 0; 

       const salesLast2Months = (item.out || 0) + (item.nov || 0);
       const daysElapsed = 61; 
       const dailyAvgSales = salesLast2Months / daysElapsed;
       const totalAvail = (item.stock || 0) + transitInfo.qty;
       
       let daysOfStock = 0;
       if (dailyAvgSales > 0) daysOfStock = Math.ceil(totalAvail / dailyAvgSales); 
       else if (totalAvail > 0) daysOfStock = 999;
       
       return { ...item, transitQty: transitInfo.qty, transitDate, currentMonthSales, previousMonthSales, daysOfStock };
    });
  }, [data, transitData]);

  const kpis = useMemo(() => {
    if(!enrichedData.length) return null;
    const total25 = enrichedData.reduce((a,b) => a + b.sales25, 0);
    const stock = enrichedData.reduce((a,b) => a + b.stock, 0);
    const transit = enrichedData.reduce((a,b) => a + b.transitQty, 0);
    const byBrand = {};
    ALLOWED_BRANDS.forEach(b => byBrand[b] = { name: b, val: 0, val24: 0, stock: 0, transit: 0, conds: 0, evaps: 0 });
    enrichedData.forEach(r => {
       if(byBrand[r.brand]) {
         byBrand[r.brand].val += r.sales25;
         byBrand[r.brand].val24 += (r.sales24 || 0); 
         byBrand[r.brand].stock += r.stock;
         byBrand[r.brand].transit += r.transitQty;
         if(r.type === 'Condensadora') byBrand[r.brand].conds += 1;
         if(r.type === 'Evaporadora') byBrand[r.brand].evaps += 1;
       }
    });
    return { total25, stock, transit, brands: Object.values(byBrand).sort((a,b) => b.val - a.val) };
  }, [enrichedData]);

  const viewData = useMemo(() => {
    if(!viewBrand) return null;
    let items = enrichedData.filter(r => r.brand === viewBrand);
    if (hideZeroSales) items = items.filter(r => r.sales25 > 0);
    if (stockFilter === 'LOW') items = items.filter(r => r.daysOfStock < 15);
    if (stockFilter === 'CRITICAL') items = items.filter(r => r.daysOfStock < 7);
    if (stockFilter === 'EXCESS') items = items.filter(r => r.daysOfStock > 120);

    const filtered = items.filter(r => {
       const term = searchTerm.toUpperCase();
       return !term || String(r.code).includes(term) || r.desc.includes(term) || r.factory.includes(term);
    });
    
    // Vendas Recentes FIXAS
    const recentSales = [
      { month: 'SET', val: items.reduce((a,b)=>a+(b.set||0),0) },
      { month: 'OUT', val: items.reduce((a,b)=>a+(b.out||0),0) },
      { month: 'NOV', val: items.reduce((a,b)=>a+(b.nov||0),0) }
    ];

    const bestSellers = [...items].sort((a,b) => b.sales25 - a.sales25).slice(0, 5);
    const brandKPI = kpis.brands.find(b => b.name === viewBrand);
    const total24 = brandKPI ? brandKPI.val24 : 0;
    const total25 = brandKPI ? brandKPI.val : 0;
    const growth = total24 > 0 ? ((total25 - total24) / total24) : 0;

    return {
       items: filtered,
       conds: filtered.filter(r => r.type === 'Condensadora'),
       evaps: filtered.filter(r => r.type === 'Evaporadora'),
       others: filtered.filter(r => r.type === 'Outros'),
       total: total25,
       stock: items.reduce((a,b)=>a+b.stock,0),
       recentSales,
       bestSellers,
       growth
    };
  }, [enrichedData, viewBrand, searchTerm, stockFilter, hideZeroSales, kpis]);

  const handleExportReport = () => {
    if (!viewBrand) return;
    let itemsToExport = enrichedData.filter(r => r.brand === viewBrand);
    
    if (!exportConfig.includeZero) {
       itemsToExport = itemsToExport.filter(r => r.sales25 > 0);
    }

    const excelData = itemsToExport.map(item => ({
       'SKU': item.code,
       'Descrição': item.desc,
       'Cód. Fabricante': item.factory,
       'Vendas 2024': item.sales24 || 0,
       'Vendas 2025': item.sales25 || 0,
       'Vendas Setembro': item.set || 0,
       'Vendas Outubro': item.out || 0,
       'Vendas Novembro': item.nov || 0,
       'Estoque Físico': item.stock || 0,
       'Trânsito': item.transitQty || 0,
       'Dias de Estoque': item.daysOfStock > 900 ? 'Sem Venda' : item.daysOfStock
    }));

    const ws = window.XLSX.utils.json_to_sheet(excelData);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    window.XLSX.writeFile(wb, `${exportConfig.filename || 'Relatorio'}_${viewBrand}.xlsx`);
    
    setExportModalOpen(false);
    addToast('Relatório gerado com sucesso!', 'success');
  };

  if(loading) return <div className="h-full flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full"></div></div>;

  // --- DETALHE DA MARCA ---
  if (viewBrand && viewData) {
      return (
        <div className="space-y-5 animate-fadeIn">
          {/* Header */}
          <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
             <div className="flex items-center gap-4">
                <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={()=>{setViewBrand(null); setSearchTerm('');}} className="border-slate-300 px-3 text-xs">Voltar</Button>
                <div>
                   <h2 className="text-xl font-bold text-slate-900">{viewBrand}</h2>
                   <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500 font-medium uppercase">Crescimento YoY</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${viewData.growth >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                         {viewData.growth > 0 ? '+' : ''}{Formatters.percent(viewData.growth)}
                      </span>
                   </div>
                </div>
             </div>
             <div className="flex gap-6 items-center">
               <div className="text-right border-r border-slate-200 pr-6 hidden md:block">
                 <span className="block text-[10px] font-bold text-slate-400 uppercase">Total 2025</span>
                 <span className="block text-lg font-bold text-slate-800">{Formatters.number(viewData.total)}</span>
               </div>
               <div className="text-right hidden md:block border-r border-slate-200 pr-6">
                 <span className="block text-[10px] font-bold text-slate-400 uppercase">Estoque Físico</span>
                 <span className="block text-lg font-bold text-slate-800">{Formatters.number(viewData.stock)}</span>
               </div>
               
               {/* Botão Exportar */}
               <Button variant="primary" size="sm" icon={FileDown} onClick={() => setExportModalOpen(true)} className="shadow-md">Exportar Relatório</Button>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
             <Card className="lg:col-span-2 p-5 flex flex-col">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-slate-400"/> Vendas Últimos 3 Meses</h3>
                <div className="grid grid-cols-3 gap-4 flex-1">
                   {viewData.recentSales.map(s => (
                      <div key={s.month} className="bg-slate-50 rounded border border-slate-100 p-4 text-center flex flex-col justify-center">
                         <span className="text-xs font-bold text-slate-400 uppercase mb-1">{s.month}</span>
                         <span className="text-xl font-bold text-blue-700">{Formatters.number(s.val)}</span>
                      </div>
                   ))}
                </div>
             </Card>

             <Card className="p-5 flex flex-col">
                <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500"/> Top 5 Produtos</h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                   <div className="space-y-2">
                      {viewData.bestSellers.map((p, i) => (
                         <div key={i} className="flex justify-between items-center text-xs border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                            <div className="flex items-center gap-2 overflow-hidden">
                               <span className="font-bold text-slate-400 w-3">{i+1}.</span>
                               <span className="truncate font-medium text-slate-700" title={p.desc}>{p.desc.substring(0, 25)}...</span>
                            </div>
                            <span className="font-bold text-slate-900">{Formatters.number(p.sales25)}</span>
                         </div>
                      ))}
                   </div>
                </div>
             </Card>
          </div>

          <Card className="p-0 overflow-hidden">
             <div className="flex flex-col md:flex-row justify-between items-center p-4 border-b border-slate-200 bg-slate-50 gap-4">
                <div className="flex bg-white border border-slate-300 rounded-md p-0.5">
                   {[{id:'conds', label:'Condensadoras'},{id:'evaps', label:'Evaporadoras'},{id:'others', label:'Outros'}].map(t => (
                     <button key={t.id} onClick={()=>setActiveTab(t.id)} className={`px-4 py-1.5 rounded-sm text-xs font-bold transition-all ${activeTab===t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>{t.label}</button>
                   ))}
                </div>
                <div className="flex items-center gap-3">
                   <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                      <input type="checkbox" checked={hideZeroSales} onChange={()=>setHideZeroSales(!hideZeroSales)} className="rounded text-blue-600 focus:ring-blue-500 border-slate-300" />
                      Ocultar Sem Vendas
                   </label>
                   <select value={stockFilter} onChange={e=>setStockFilter(e.target.value)} className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white font-medium focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer">
                      <option value="ALL">Todos Status</option>
                      <option value="CRITICAL">🚨 Crítico (&lt;7d)</option>
                      <option value="LOW">⚠️ Baixo (&lt;15d)</option>
                      <option value="EXCESS">📦 Excesso (&gt;120d)</option>
                   </select>
                   <div className="relative w-56">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Buscar SKU..." className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                   </div>
                </div>
             </div>

             <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                   <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                         <th className="px-4 py-3 w-1/3">Produto / SKU</th>
                         <th className="px-4 py-3 text-right">Venda Ant.</th>
                         <th className="px-4 py-3 text-right">Venda Atual</th>
                         <th className="px-4 py-3 text-right">Estoque</th>
                         <th className="px-4 py-3 text-center">Trânsito</th>
                         <th className="px-4 py-3 text-center">Cobertura (Dias)</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {(activeTab === 'conds' ? viewData.conds : activeTab === 'evaps' ? viewData.evaps : viewData.others).map((r, i) => {
                         let daysClass = "text-slate-600 font-mono font-bold";
                         if(r.daysOfStock < 7) daysClass = "text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100";
                         else if(r.daysOfStock < 15) daysClass = "text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100";
                         else if(r.daysOfStock > 120) daysClass = "text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100";

                         return (
                           <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                 <div className="flex flex-col">
                                    <span className="font-bold text-slate-800 truncate max-w-xs" title={r.desc}>{r.desc}</span>
                                    <span className="text-[10px] text-slate-500 font-mono mt-0.5">{r.code} • {r.factory}</span>
                                 </div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-500">{Formatters.number(r.previousMonthSales)}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-800 font-bold">{Formatters.number(r.currentMonthSales)}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{r.stock}</td>
                              <td className="px-4 py-3 text-center">
                                 {r.transitQty > 0 ? (
                                    <div className="inline-block text-center leading-tight bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                       <span className="block font-bold text-blue-700 text-[10px]">{r.transitQty}</span>
                                       {r.transitDate && <span className="block text-[8px] text-slate-500 mt-0.5">{Formatters.date(r.transitDate)}</span>}
                                    </div>
                                 ) : <span className="text-slate-300">-</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                 <span className={daysClass}>
                                    {r.daysOfStock > 900 ? '∞' : Formatters.number(r.daysOfStock)}
                                 </span>
                              </td>
                           </tr>
                         );
                      })}
                   </tbody>
                </table>
             </div>
          </Card>

          <Modal isOpen={exportModalOpen} onClose={() => setExportModalOpen(false)} title="Exportar Relatório Executivo" size="sm" 
             actions={<><Button variant="secondary" onClick={() => setExportModalOpen(false)}>Cancelar</Button><Button onClick={handleExportReport} icon={Download}>Gerar Excel</Button></>}>
             <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                   <p className="text-xs font-bold text-slate-500 uppercase mb-1">Marca Selecionada</p>
                   <p className="text-lg font-bold text-slate-800">{viewBrand}</p>
                </div>
                <InputField label="Nome do Arquivo" value={exportConfig.filename} onChange={e => setExportConfig({...exportConfig, filename: e.target.value})} placeholder="Ex: relatorio_samsung_nov" />
                <div className="flex items-center gap-2 mt-2">
                   <input type="checkbox" id="includeZero" checked={exportConfig.includeZero} onChange={e => setExportConfig({...exportConfig, includeZero: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer" />
                   <label htmlFor="includeZero" className="text-sm text-slate-700 cursor-pointer font-medium">Incluir produtos sem vendas (Venda 2025 = 0)</label>
                </div>
                <p className="text-xs text-slate-400 italic mt-2">O relatório incluirá: SKU, Descrição, Ref., Vendas (2024, 2025, Trimestre), Estoque, Trânsito e Dias de Cobertura.</p>
             </div>
          </Modal>
        </div>
      );
  }

  // --- DASHBOARD PRINCIPAL ---
  return (
    <div className="space-y-6 animate-fadeIn">
       <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-200 pb-4">
         <div>
            <h2 className="text-2xl font-bold text-slate-900">Visão Geral</h2>
            <p className="text-slate-500 text-xs font-medium mt-1">Dashboard de Performance Comercial</p>
         </div>
         <div className="flex gap-2">
            <input type="file" ref={matrixFileRef} onChange={processMatrixUpload} className="hidden" accept=".csv,.xlsx" />
            <Button onClick={()=>matrixFileRef.current.click()} icon={Upload} variant="secondary" size="sm">Upload Matriz</Button>
            
            <input type="file" ref={transitFileRef} onChange={processTransitUpload} className="hidden" accept=".csv,.xlsx" />
            <Button onClick={()=>transitFileRef.current.click()} icon={Ship} variant="black" size="sm">Upload Trânsito</Button>
         </div>
       </div>

       {!kpis ? (
          <div className="py-20 text-center border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
             <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
             <p className="text-slate-700 font-bold text-sm">Nenhum dado carregado</p>
             <p className="text-slate-500 text-xs mt-1">Realize o upload das planilhas (Matriz e Trânsito) para começar.</p>
          </div>
       ) : (
          <>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: "Vendas (2025)", val: kpis.total25, icon: TrendingUp, color: "text-blue-700 bg-blue-50 border-blue-100" },
                  { label: "Estoque Físico", val: kpis.stock, icon: Box, color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
                  { label: "Em Trânsito", val: kpis.transit, icon: Ship, color: "text-purple-700 bg-purple-50 border-purple-100" },
                  { label: "Fabricantes", val: kpis.brands.length, icon: Layers, color: "text-amber-700 bg-amber-50 border-amber-100" }
                ].map((stat, i) => (
                  <Card key={i} className="p-4 flex items-center gap-4 hover:-translate-y-1 transition-transform">
                     <div className={`w-10 h-10 rounded flex items-center justify-center border ${stat.color}`}>
                        <stat.icon className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-2xl font-bold text-slate-900 leading-none mb-0.5">{Formatters.number(stat.val)}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{stat.label}</p>
                     </div>
                  </Card>
                ))}
             </div>

             <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">Performance por Fabricante</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                   {kpis.brands.map(b => (
                      <Card key={b.name} onClick={()=>{setViewBrand(b.name); setSearchTerm(''); setActiveTab('conds');}} hoverable className="p-5 flex flex-col justify-between h-40 group border-l-[4px] border-l-slate-200 hover:border-l-blue-700">
                         <div className="flex justify-between items-start">
                            <span className="font-bold text-lg text-slate-800">{b.name}</span>
                            <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-blue-700 transition-colors"/>
                         </div>
                         <div>
                            <p className="text-2xl font-bold text-slate-900 tracking-tight">{Formatters.number(b.val)}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Unidades Vendidas</p>
                            
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                               <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{b.conds} Conds</span>
                               <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{b.evaps} Evaps</span>
                            </div>
                         </div>
                      </Card>
                   ))}
                </div>
             </div>
          </>
       )}
    </div>
  );
};

// --- 4.4: GESTÃO DE PEDIDOS (Purchase Manager) ---
const PurchaseManager = ({ user }) => {
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({ orderNumber: '', supplier: 'SAMSUNG', date: new Date().toISOString().split('T')[0], items: [] });
  const [expandedOrder, setExpandedOrder] = useState(null); 
  const [brandFilter, setBrandFilter] = useState('ALL');
  const fileInputRef = useRef(null);

  const [actionModal, setActionModal] = useState({ open: false, type: null, item: null, order: null });
  const [actionForm, setActionForm] = useState({ qty: '', date: new Date().toISOString().split('T')[0] });

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'multisplit_orders'), orderBy('date', 'desc')), 
      (s) => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error(error));
    return () => unsub();
  }, [user]);

  const handleDelete = async (id) => {
    if(confirm('Confirmar exclusão deste pedido?')) { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'multisplit_orders', id)); addToast('Pedido excluído.', 'success'); }
  };

  const processOrderUpload = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = window.XLSX; const wb = XLSX.read(evt.target.result, {type:'binary'});
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const items = json.map((r, i) => ({
             id: Date.now() + i,
             sku: normalizeSKU(findColumnValue(r, ['SKU', 'Código'])),
             desc: findColumnValue(r, ['Descrição', 'Produto']),
             qty: parseInt(findColumnValue(r, ['Quantidade', 'Qtd'])) || 1,
             cost: Formatters.parseMoney(findColumnValue(r, ['Custo', 'Valor'])),
             invoiced: 0, scheduled: 0, history: []
        }));
        setFormData(p => ({ ...p, items }));
      } catch(err) { addToast('Erro ao ler planilha.', 'error'); }
    };
    reader.readAsBinaryString(file);
  };

  const saveOrder = async () => {
    if(!formData.items.length) return addToast('Adicione itens ao pedido.', 'error');
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'multisplit_orders'), { ...formData, status: 'pendente', createdAt: serverTimestamp() });
    setModalOpen(false); addToast('Pedido criado com sucesso.', 'success'); setFormData({ orderNumber: '', supplier: 'SAMSUNG', date: new Date().toISOString().split('T')[0], items: [] });
  };

  const handleItemAction = async () => {
    const { item, type, order } = actionModal;
    const qty = parseInt(actionForm.qty);
    if(qty <= 0) return;

    const orderRef = doc(db, 'artifacts', appId, 'users', user.uid, 'multisplit_orders', order.id);
    const newItems = [...order.items];
    const idx = newItems.findIndex(i => i.id === item.id);
    
    if (type === 'invoice') {
       newItems[idx].invoiced = (newItems[idx].invoiced || 0) + qty;
       if (newItems[idx].scheduled > 0) newItems[idx].scheduled = Math.max(0, newItems[idx].scheduled - qty);
       newItems[idx].history.push({ type: 'Faturado', qty, date: actionForm.date });
    } else if (type === 'schedule') {
       newItems[idx].scheduled = (newItems[idx].scheduled || 0) + qty;
       newItems[idx].history.push({ type: 'Agendado', qty, date: actionForm.date });
    }

    const totalQty = newItems.reduce((acc, i) => acc + i.qty, 0);
    const totalInv = newItems.reduce((acc, i) => acc + (i.invoiced || 0), 0);
    const status = totalInv === 0 ? 'pendente' : totalInv >= totalQty ? 'faturado' : 'parcial';

    await updateDoc(orderRef, { items: newItems, status });
    setActionModal({ open: false, type: null, item: null, order: null });
    addToast('Item atualizado.', 'success');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
         <div>
            <h2 className="text-2xl font-bold text-slate-900">Pedidos de Compra</h2>
            <p className="text-slate-500 text-xs font-medium mt-1">Gerenciamento de Supply Chain</p>
         </div>
         <Button onClick={() => setModalOpen(true)} icon={Plus} variant="primary" size="md">Novo Pedido</Button>
      </div>

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-1">
         <button onClick={() => setBrandFilter('ALL')} className={`px-4 py-2 text-xs font-bold border-b-4 transition-all ${brandFilter==='ALL' ? 'border-slate-900 text-slate-900 bg-slate-50' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>TODOS</button>
         {ALLOWED_BRANDS.slice(0, 6).map(b => (
            <button key={b} onClick={() => setBrandFilter(b)} className={`px-4 py-2 text-xs font-bold border-b-4 transition-all ${brandFilter===b ? 'border-blue-700 text-blue-800 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{b}</button>
         ))}
      </div>

      <div className="space-y-4">
         {orders.filter(o => brandFilter === 'ALL' || o.supplier === brandFilter).map(order => {
           const total = order.items.reduce((a,b)=>a+(b.cost*b.qty),0);
           const isExpanded = expandedOrder === order.id;

           return (
             <Card key={order.id} className="overflow-hidden border border-slate-200 transition-all hover:shadow-md">
                <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-white hover:bg-slate-50 cursor-pointer" onClick={()=>setExpandedOrder(isExpanded ? null : order.id)}>
                   <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="p-2 bg-slate-100 rounded border border-slate-200"><FileText className="w-5 h-5 text-slate-600"/></div>
                      <div>
                         <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-slate-900">#{order.orderNumber}</span>
                            <span className="text-xs text-slate-400">|</span>
                            <span className="text-xs font-bold text-slate-600 uppercase">{order.supplier}</span>
                         </div>
                         <span className="text-xs text-slate-500 font-medium mt-0.5 block">{Formatters.date(order.date)}</span>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-6 w-full md:w-auto mt-4 md:mt-0 justify-between md:justify-end">
                      <div className="text-right">
                         <span className="block text-[10px] font-bold text-slate-400 uppercase">Valor Total</span>
                         <span className="block text-lg font-bold text-slate-900">{Formatters.currency(total)}</span>
                      </div>
                      <StatusBadge status={order.status} />
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" icon={Trash2} onClick={(e)=>{e.stopPropagation(); handleDelete(order.id)}} className="text-slate-400 hover:text-red-600 hover:bg-red-50"/>
                        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}/>
                      </div>
                   </div>
                </div>

                {isExpanded && (
                   <div className="border-t border-slate-200 bg-slate-50 p-4 animate-fadeIn">
                      <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
                        <table className="w-full text-left text-xs">
                           <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                              <tr>
                                 <th className="px-4 py-2">Item / SKU</th>
                                 <th className="px-4 py-2 text-center">Qtd</th>
                                 <th className="px-4 py-2 text-center">Faturado</th>
                                 <th className="px-4 py-2 text-center">Agendado</th>
                                 <th className="px-4 py-2 text-right">Ações</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                             {order.items.map((item, idx) => {
                                const pending = item.qty - (item.invoiced || 0) - (item.scheduled || 0);
                                return (
                                   <tr key={idx} className="hover:bg-slate-50">
                                      <td className="px-4 py-2">
                                         <div className="font-bold text-slate-800 text-xs truncate max-w-xs" title={item.desc}>{item.desc}</div>
                                         <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.sku}</div>
                                      </td>
                                      <td className="px-4 py-2 text-center font-bold text-slate-800">{item.qty}</td>
                                      <td className="px-4 py-2 text-center text-emerald-700 font-bold">{item.invoiced || 0}</td>
                                      <td className="px-4 py-2 text-center text-purple-700 font-bold">{item.scheduled || 0}</td>
                                      <td className="px-4 py-2 text-right">
                                         {pending > 0 ? (
                                            <div className="flex justify-end gap-2">
                                               <Button variant="success" size="xs" onClick={() => { setActionModal({ open: true, type: 'invoice', item, order }); setActionForm({ qty: pending, date: new Date().toISOString().split('T')[0] }); }}>Faturar</Button>
                                               <Button variant="purple" size="xs" onClick={() => { setActionModal({ open: true, type: 'schedule', item, order }); setActionForm({ qty: pending, date: new Date().toISOString().split('T')[0] }); }}>Agendar</Button>
                                            </div>
                                         ) : <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Concluído</span>}
                                      </td>
                                   </tr>
                                );
                             })}
                           </tbody>
                        </table>
                      </div>
                   </div>
                )}
             </Card>
           );
         })}
      </div>

      <Modal isOpen={modalOpen} onClose={()=>setModalOpen(false)} title="Novo Pedido de Compra" size="lg" actions={<><Button variant="secondary" onClick={()=>setModalOpen(false)}>Cancelar</Button><Button onClick={saveOrder}>Criar Pedido</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
           <InputField label="Nº Pedido (PO)" value={formData.orderNumber} onChange={e=>setFormData({...formData, orderNumber: e.target.value})} placeholder="Ex: PO-2025-001" />
           <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Fornecedor</label>
              <select className="w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600" value={formData.supplier} onChange={e=>setFormData({...formData, supplier:e.target.value})}>
                 {ALLOWED_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
           </div>
           <InputField type="date" label="Data Emissão" value={formData.date} onChange={e=>setFormData({...formData, date:e.target.value})} />
        </div>
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors relative cursor-pointer group">
           <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" ref={fileInputRef} onChange={processOrderUpload} />
           <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
           <p className="text-sm font-bold text-slate-700">Importar itens (Excel/CSV)</p>
           <p className="text-xs text-slate-500 mt-0.5">Arraste ou clique para selecionar</p>
        </div>
        {formData.items.length > 0 && (
           <div className="mt-4 border rounded border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                 <span className="text-xs font-bold text-slate-700 uppercase">{formData.items.length} Itens Carregados</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                 <table className="w-full text-left text-xs font-medium">
                    <tbody className="divide-y divide-slate-100">
                       {formData.items.map((i,k) => (
                          <tr key={k}>
                             <td className="px-4 py-2 truncate max-w-xs text-slate-700">{i.desc}</td>
                             <td className="px-4 py-2 text-right font-mono font-bold">{i.qty}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        )}
      </Modal>

      <Modal isOpen={actionModal.open} onClose={() => setActionModal({ ...actionModal, open: false })} title={actionModal.type === 'invoice' ? "Registrar Faturamento" : "Agendar Recebimento"} size="sm" 
         actions={<><Button variant="secondary" onClick={() => setActionModal({ ...actionModal, open: false })}>Cancelar</Button><Button onClick={handleItemAction}>Salvar</Button></>}>
         <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded border border-slate-200">
               <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Item Selecionado</p>
               <p className="text-sm font-bold text-slate-800">{actionModal.item?.desc}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <InputField label="Quantidade" type="number" value={actionForm.qty} onChange={e => setActionForm({ ...actionForm, qty: e.target.value })} />
               <InputField label="Data Efetiva" type="date" value={actionForm.date} onChange={e => setActionForm({ ...actionForm, date: e.target.value })} />
            </div>
         </div>
      </Modal>
    </div>
  );
};

// --- 5. CONTAINER PRINCIPAL ---
export default function AppContainer() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    if (!window.XLSX) { const script = document.createElement('script'); script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; script.async = true; document.body.appendChild(script); }
    const initAuth = async () => { if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token); };
    initAuth();
    return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full"></div></div>;
  if (!user) return <LoginModule />;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
        {/* Sidebar Fixa */}
        <aside className="w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800 z-50">
           <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
              <Activity className="w-5 h-5 text-blue-500 mr-2" />
              <span className="font-bold text-lg text-white tracking-tight">Climario<span className="text-slate-500">ERP</span></span>
           </div>
           
           <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 mt-2">Gestão</div>
              <button onClick={() => setCurrentView('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentView === 'dashboard' ? 'bg-blue-900/40 text-blue-400 border border-blue-900/50' : 'hover:bg-slate-800 hover:text-white'}`}>
                 <LayoutGrid className="w-4 h-4" /> Dashboard
              </button>
              <button onClick={() => setCurrentView('schedule')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentView === 'schedule' ? 'bg-blue-900/40 text-blue-400 border border-blue-900/50' : 'hover:bg-slate-800 hover:text-white'}`}>
                 <CalendarCheck className="w-4 h-4" /> Calendário
              </button>
              <button onClick={() => setCurrentView('purchases')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentView === 'purchases' ? 'bg-blue-900/40 text-blue-400 border border-blue-900/50' : 'hover:bg-slate-800 hover:text-white'}`}>
                 <List className="w-4 h-4" /> Pedidos de Compra
              </button>
           </nav>

           <div className="p-4 border-t border-slate-800 bg-slate-950">
              <div className="flex items-center gap-3 mb-4 px-1">
                 <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center font-bold text-xs text-white">AD</div>
                 <div className="overflow-hidden">
                    <p className="text-sm font-bold text-white truncate">Administrador</p>
                    <p className="text-xs text-slate-500 truncate">admin@climario.com</p>
                 </div>
              </div>
              <button onClick={() => signOut(auth)} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-red-400 hover:bg-red-950/20 hover:text-red-300 transition-colors border border-transparent hover:border-red-900/30">
                 <LogOut className="w-4 h-4" /> Encerrar Sessão
              </button>
           </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 ml-64 p-8 overflow-y-auto min-h-screen">
           <div className="max-w-[1600px] mx-auto">
              {currentView === 'dashboard' && <BIDashboard user={user} />}
              {currentView === 'schedule' && <DeliverySchedule />}
              {currentView === 'purchases' && <PurchaseManager user={user} />}
           </div>
        </main>
      </div>
    </ToastProvider>
  );
}