import React, { useEffect, useState, useRef } from 'react';
import mascoteImg from './assets/shopito.png'; // ajuste o caminho se necessário
import { supabase } from './lib/supabase';
import { RefreshCw, Filter, Truck, Clock, Package, Layers, RotateCcw, ChevronDown, Check, Home, Search } from 'lucide-react';

// =====================================================================
// DESIGN TOKENS - PALETA SHOPEE & REGRAS
// =====================================================================

const CPT_WINDOW_MINUTES = 120;
const AGING_ALERT_MINUTES = 240;

const SHOPEE_PALETTE = {
  orange: '#EE4D2D',
  red: '#B50220',
  navy: '#0D274C',
  blue: '#004AB5',
  lightBlue: '#1665C4',
  cyan: '#218E7E',
  yellow: '#E5A300',
  grayBg: '#F1F2F3',
  grayBorder: '#E9EBED',
  grayText: '#A1A8B4',
  darkText: '#0D274C',
};

const STATUS_SCALE = [
  { max: 33, text: '#218E7E', bg: 'rgba(33, 142, 126, 0.15)', border: '#218E7E' },
  { max: 66, text: '#E5A300', bg: 'rgba(229, 163, 0, 0.18)', border: '#E5A300' },
  { max: Infinity, text: '#B50220', bg: 'rgba(181, 2, 32, 0.22)', border: '#B50220' }
];

const NEUTRAL_THEME = { text: '#94A3B8', border: '#E2E8F0', bg: 'transparent' };

function getStatusTheme(pct) {
  return STATUS_SCALE.find(s => pct <= s.max);
}

function parseAgingMinutes(agingStr) {
  if (!agingStr || agingStr.trim() === '-' || agingStr.trim() === '') return 0;
  
  const match = /(\d+)\s*h\s*(\d+)\s*m/i.exec(agingStr);
  if (match) {
    const horas = parseInt(match[1], 10) || 0;
    const minutos = parseInt(match[2], 10) || 0;
    return horas * 60 + minutos;
  }

  const apenasHoras = /(\d+)\s*h/i.exec(agingStr);
  if (apenasHoras) return (parseInt(apenasHoras[1], 10) || 0) * 60;

  const apenasMinutos = /(\d+)\s*m/i.exec(agingStr);
  if (apenasMinutos) return parseInt(apenasMinutos[1], 10) || 0;

  return 0;
}

function getAgingTheme(agingStr) {
  const minutes = parseAgingMinutes(agingStr);
  const pct = Math.min((minutes / AGING_ALERT_MINUTES) * 100, 100);
  return getStatusTheme(pct);
}

// AJUSTE 2: Nova lógica de cores para o CPT das docas
function getCptTheme(cptTimeString, horaAtual) {
  if (!cptTimeString || cptTimeString === '-' || !cptTimeString.includes(':')) return NEUTRAL_THEME;

  const [h, m] = cptTimeString.split(':').map(Number);
  const cptDate = new Date(horaAtual);
  cptDate.setHours(h, m, 0, 0);

  const diffMinutes = (cptDate - horaAtual) / (1000 * 60);

  // Cyan: Faltando mais de 75 minutos
  if (diffMinutes >= 75) return STATUS_SCALE[0];
  
  // Yellow: Faltando entre 75 minutos e 30 minutos
  if (diffMinutes > 30) return STATUS_SCALE[1];

  // Red: Faltando 30 minutos ou menos / CPT vencido
  return STATUS_SCALE[2];
}

function getDynamicGradient(pct, mirrored = false) {
  const green = 'rgba(33, 142, 126, 0.25)';
  const yellow = 'rgba(229, 163, 0, 0.25)';
  const red = 'rgba(181, 2, 32, 0.25)';

  if (pct <= 33) {
    return green;
  } else if (pct <= 66) {
    return mirrored
      ? `linear-gradient(270deg, ${green} 0%, ${yellow} 100%)`
      : `linear-gradient(90deg, ${green} 0%, ${yellow} 100%)`;
  } else {
    return mirrored
      ? `linear-gradient(270deg, ${green} 0%, ${yellow} 50%, ${red} 100%)`
      : `linear-gradient(90deg, ${green} 0%, ${yellow} 50%, ${red} 100%)`;
  }
}

// =====================================================================
// PARSERS E TRATAMENTO DE STRING/DATA
// =====================================================================

function parseNumeroRua(val) {
  if (!val) return 0;
  const str = String(val);
  const match = str.match(/\d+/g);
  if (match && match.length > 0) {
    return parseInt(match[match.length - 1], 10);
  }
  return 0;
}

function parseCptToDate(cptTimestampStr) {
  if (!cptTimestampStr || cptTimestampStr === '-') return null;

  const partes = cptTimestampStr.split('|');
  const targetStr = partes[partes.length - 1].trim();

  const match = targetStr.match(/(\d{2})-(\d{2})(\d{2}):(\d{2})/);
  if (match) {
    const [_, dia, mes, hora, minuto] = match;
    const anoAtual = new Date().getFullYear();
    return new Date(anoAtual, parseInt(mes, 10) - 1, parseInt(dia, 10), parseInt(hora, 10), parseInt(minuto, 10));
  }

  return null;
}

function extractLastTime(cptTimestampStr) {
  const dateObj = parseCptToDate(cptTimestampStr);
  if (dateObj && !isNaN(dateObj.getTime())) {
    const h = String(dateObj.getHours()).padStart(2, '0');
    const m = String(dateObj.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '-';
}

function limparNomeDestino(str) {
  if (!str) return '';

  const tratarUnico = (item) => {
    let clean = String(item).trim();

    clean = clean.replace(/\[?\d*\]?SoC[_\s]ES[_\s]Viana/gi, '').trim();
    clean = clean.replace(/\[.*?\]/g, '').trim();
    clean = clean.replace(/[_]+/g, ' ').trim();
    clean = clean.replace(/\s+\d+\s*$/g, '').trim();

    return clean;
  };

  const partes = String(str).split('|').map(tratarUnico).filter(Boolean);
  return partes.join(', ');
}

function parseDestinosRua(val) {
  if (!val) return { exibicao: 'Sem Destino', lista: [] };

  const exibicaoLimpa = limparNomeDestino(val);
  const lista = exibicaoLimpa.split(',').map(s => s.trim()).filter(Boolean);

  if (lista.length === 0) {
    return { exibicao: 'Sem Destino', lista: [] };
  }

  return {
    exibicao: exibicaoLimpa,
    lista: lista
  };
}

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================

export default function App() {
  const [ruas, setRuas] = useState([]);
  const [cptsList, setCptsList] = useState([]);
  const [docasList, setDocasList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ultimaSinc, setUltimaSinc] = useState('');
  
  const [selectedDestinos, setSelectedDestinos] = useState([]);
  const [selectedRuas, setSelectedRuas] = useState([]);
  
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [ordenacao, setOrdenacao] = useState('numero');

  useEffect(() => {
    fetchAllData();

    // Relógio de 1 em 1 segundo
    const clockTimer = setInterval(() => setHoraAtual(new Date()), 1000);

    // Auto-refresh da página/dados de 10 em 10 minutos (600.000 ms)
    const autoRefreshTimer = setInterval(() => {
      fetchAllData();
    }, 10 * 60 * 1000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(autoRefreshTimer);
    };
  }, []);

  async function fetchAllData() {
    setLoading(true);
    const agora = new Date();
    setUltimaSinc(agora.toLocaleTimeString('pt-BR'));

    await Promise.all([
      fetchRuas(),
      fetchTrips()
    ]);

    setLoading(false);
  }

  async function fetchRuas() {
    const { data, error } = await supabase
      .from('stage_out_ruas')
      .select('*');

    if (!error && data && data.length > 0) {
      const ruasValidas = data.filter(r => {
        const st = String(r.status || '').trim().toLowerCase();
        return st !== 'unavailable';
      });

      const ruasFormatadas = ruasValidas.map(r => {
        const numRua = parseNumeroRua(r.numero_rua);
        const { exibicao, lista } = parseDestinosRua(r.destino);
        const cap = Number(r.capacidade_total) || 0;
        const gaiolas = Number(r.qtd_gaiolas) || 0;
        const scuttles = Number(r.qtd_scuttles) || 0;
        const totalOc = r.total_ocupado !== undefined && r.total_ocupado !== null 
          ? Number(r.total_ocupado) 
          : (gaiolas + scuttles);

        return {
          ...r,
          numero_rua_num: numRua,
          numero_rua_str: String(numRua).padStart(3, '0'),
          destino_exibicao: exibicao,
          destinos_lista: lista,
          capacidade_total: cap,
          qtd_gaiolas: gaiolas,
          qtd_scuttles: scuttles,
          total_ocupado: totalOc
        };
      });

      setRuas(ruasFormatadas);
    } else {
      setRuas([]);
    }
  }

  async function fetchTrips() {
    const { data, error } = await supabase
      .from('trips_cpt')
      .select('*');

    if (!error && data && data.length > 0) {
      
      const cptsMapeados = data
        .filter(item => String(item.status || '').trim().toLowerCase() !== 'loading')
        .map(item => {
          const dateObj = parseCptToDate(item.cpt_timestamp);
          const horaCpt = extractLastTime(item.cpt_timestamp);
          const destinoLimpo = limparNomeDestino(item.station);
          const pcts = item.pedidos_embalados ? Number(item.pedidos_embalados).toLocaleString('pt-BR') : '0';

          return {
            id: item.id,
            destino: destinoLimpo || 'N/A',
            cpt: horaCpt,
            cptDate: dateObj,
            pacotes: pcts,
            status: item.status
          };
        })
        .filter(item => item.cptDate !== null)
        .sort((a, b) => a.cptDate - b.cptDate)
        .slice(0, 6);

      setCptsList(cptsMapeados);

      const docasAlvo = ['OUT79', 'OUT80', 'OUT81', 'OUT82', 'OUT83', 'OUT84'];
      
      const docasMapeadas = docasAlvo.map(docaId => {
        const tripDoca = data.find(t => String(t.doca_saida || '').toUpperCase().includes(docaId));
        
        if (tripDoca) {
          return {
            id: docaId,
            ativa: true,
            veiculo: limparNomeDestino(tripDoca.station) || tripDoca.tipo_veiculo || 'DOCADO',
            cpt: extractLastTime(tripDoca.cpt_timestamp)
          };
        } else {
          return {
            id: docaId,
            ativa: false,
            veiculo: '-',
            cpt: '-'
          };
        }
      });

      setDocasList(docasMapeadas);
    }
  }

  const opcoesRuas = Array.from({ length: 58 }, (_, i) => i + 1)
    .filter(n => n !== 57)
    .map(n => String(n).padStart(3, '0'));

  const destinosUnicos = Array.from(
    new Set(ruas.flatMap(r => r.destinos_lista))
  ).filter(Boolean).sort();

  const handleResetFilters = () => {
    setSelectedDestinos([]);
    setSelectedRuas([]);
  };

  const hasActiveFilters = selectedDestinos.length > 0 || selectedRuas.length > 0;

  const ruasFiltradas = ruas.filter(r => {
    const matchDestino = selectedDestinos.length === 0 || 
      r.destinos_lista.some(dest => selectedDestinos.includes(dest));
    const matchRua = selectedRuas.length === 0 || selectedRuas.includes(r.numero_rua_str);
    return matchDestino && matchRua;
  });

  const capacidadeTotal = ruasFiltradas.reduce((acc, r) => acc + r.capacidade_total, 0);
  const totalGaiolas = ruasFiltradas.reduce((acc, r) => acc + r.qtd_gaiolas, 0);
  const totalScuttles = ruasFiltradas.reduce((acc, r) => acc + r.qtd_scuttles, 0);
  const totalOcupado = ruasFiltradas.reduce((acc, r) => acc + r.total_ocupado, 0);
  const pctOcupadaNum = capacidadeTotal > 0 ? (totalOcupado / capacidadeTotal) * 100 : 0;
  const ruasLivresCount = ruasFiltradas.filter(r => (r.qtd_gaiolas + r.qtd_scuttles) === 0).length;

  const sortRuas = (list) => {
    return [...list].sort((a, b) => {
      const pctA = a.capacidade_total > 0 ? (a.total_ocupado / a.capacidade_total) : 0;
      const pctB = b.capacidade_total > 0 ? (b.total_ocupado / b.capacidade_total) : 0;
      const agingA = parseAgingMinutes(a.aging_formatado);
      const agingB = parseAgingMinutes(b.aging_formatado);

      if (ordenacao === 'aging') {
        if (agingB !== agingA) return agingB - agingA;
        return a.numero_rua_num - b.numero_rua_num;
      }

      if (ordenacao === 'ocupacao') {
        if (pctB !== pctA) return pctB - pctA;
        return a.numero_rua_num - b.numero_rua_num;
      }

      return a.numero_rua_num - b.numero_rua_num;
    });
  };

  const ruasPares = sortRuas(ruasFiltradas.filter(r => r.numero_rua_num % 2 === 0));
  const ruasImpares = sortRuas(ruasFiltradas.filter(r => r.numero_rua_num % 2 !== 0));

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-5 bg-white text-slate-800 font-sans">
      
      {/* CABEÇALHO */}
      <header className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <img 
              src={mascoteImg} 
              alt="Mascote Shopee" 
              className="h-12 w-auto object-contain" 
            />
            <h1 className="text-2xl font-black tracking-wider uppercase font-mono" style={{ color: SHOPEE_PALETTE.navy }}>
              Overview Ruas <span className="text-slate-300">/</span> Stage Out
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            
            <MultiSelectDropdown
              label="Destinos"
              options={destinosUnicos}
              selected={selectedDestinos}
              setSelected={setSelectedDestinos}
              icon={Filter}
            />

            <MultiSelectDropdown
              label="Ruas"
              options={opcoesRuas}
              selected={selectedRuas}
              setSelected={setSelectedRuas}
              icon={Home}
            />

            <button
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition h-[38px] ${
                hasActiveFilters
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <RotateCcw size={14} />
              Limpar
            </button>

            <button
              onClick={fetchAllData}
              className="flex items-center gap-1.5 text-white font-bold px-4 rounded-lg text-xs transition cursor-pointer shadow h-[38px] hover:opacity-90"
              style={{ backgroundColor: SHOPEE_PALETTE.orange }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>

            <div className="flex items-center gap-2 bg-white px-3.5 rounded-lg border border-slate-200 font-mono font-bold text-sm h-[38px] shadow-sm text-slate-700">
              <Clock size={15} className="animate-pulse" style={{ color: SHOPEE_PALETTE.orange }} />
              <span>{horaAtual.toLocaleTimeString('pt-BR')}</span>
            </div>

          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
          <p>Monitoramento Operacional em Tempo Real</p>
          {ultimaSinc && <span className="font-mono text-[11px] bg-slate-200/60 px-2 py-0.5 rounded">Última sync: {ultimaSinc}</span>}
        </div>
      </header>

      {/* CARDS KPIS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Capacidade Total" value={capacidadeTotal} color={SHOPEE_PALETTE.navy} />
        <KpiCard label="Gaiolas" value={totalGaiolas} color="#8B5CF6" icon={Package} />
        <KpiCard label="Scuttles" value={totalScuttles} color="#0284C7" icon={Layers} />
        <KpiCard label="Total Ocupado" value={totalOcupado} color={SHOPEE_PALETTE.blue} />
        <KpiCard label="% Ocupada" value={`${pctOcupadaNum.toFixed(2)}%`} color={getStatusTheme(pctOcupadaNum).text} />
        <KpiCard label="Ruas Livres" value={ruasLivresCount} color={SHOPEE_PALETTE.cyan} icon={Home} highlight />
      </div>

      {/* CPTS E DOCAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        
        <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: SHOPEE_PALETTE.blue }}>
            <Clock size={16} />
            <span>Próximos CPTs</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {cptsList.length > 0 ? (
              cptsList.map((item) => <CptCard key={item.id} item={item} />)
            ) : (
              <div className="col-span-6 text-center text-slate-400 py-3">Sem CPTs disponíveis</div>
            )}
          </div>
        </section>

        <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: SHOPEE_PALETTE.cyan }}>
            <Truck size={16} />
            <span>Docas / Veículos Docados</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {docasList.length > 0 ? (
              docasList.map((doca) => <DocaCard key={doca.id} doca={doca} horaAtual={horaAtual} />)
            ) : (
              <div className="col-span-6 text-center text-slate-400 py-3">Sem Docas ativas</div>
            )}
          </div>
        </section>

      </div>

      {/* GRID DAS RUAS */}
      <div className="pt-2 space-y-4">
        
        <div className="flex items-center justify-center gap-4 w-full">
          <div className="h-[1px] bg-slate-200 flex-1" />
          <h2 className="text-sm font-black tracking-widest uppercase bg-slate-100 text-slate-800 px-5 py-1.5 rounded-full border border-slate-300 shadow-sm">
            Stage Out — Ruas
          </h2>
          <div className="h-[1px] bg-slate-200 flex-1" />
        </div>

        {/* CABEÇALHO DA GRID E ORDENAÇÃO */}
        <div className="flex items-center justify-between px-2 text-xs">
          <div className="font-bold text-slate-500 uppercase tracking-wider">
            Pares
          </div>

          <div className="flex items-center justify-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setOrdenacao('numero')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'numero'
                  ? 'bg-white text-slate-900 font-black shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Número
            </button>

            <button
              onClick={() => setOrdenacao('aging')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'aging'
                  ? 'bg-white text-slate-900 font-black shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aging
            </button>

            <button
              onClick={() => setOrdenacao('ocupacao')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'ocupacao'
                  ? 'bg-white text-slate-900 font-black shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ocupação
            </button>
          </div>

          <div className="font-bold text-slate-500 uppercase tracking-wider">
            Ímpares
          </div>
        </div>

        {/* LISTAGEM DAS RUAS */}
        {ruasFiltradas.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-12 border border-dashed border-slate-300 rounded-xl bg-slate-50">
            Nenhuma rua encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="hidden lg:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l border-dashed border-slate-300" />

            {/* PARES (ESQUERDA) */}
            <div className="space-y-2.5">
              {ruasPares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  Nenhuma rua par encontrada.
                </div>
              ) : (
                ruasPares.map((rua, idx) => <RuaCard key={rua.id || `par-${idx}`} rua={rua} />)
              )}
            </div>

            {/* ÍMPARES (DIREITA) */}
            <div className="space-y-2.5">
              {ruasImpares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  Nenhuma rua ímpar encontrada.
                </div>
              ) : (
                ruasImpares.map((rua, idx) => <RuaCard key={rua.id || `impar-${idx}`} rua={rua} mirrored />)
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// =====================================================================
// COMPONENTES AUXILIARES
// =====================================================================

function MultiSelectDropdown({ label, options, selected, setSelected, icon: Icon }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    String(opt).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      setSelected(selected.filter(item => item !== opt));
    } else {
      setSelected([...selected, opt]);
    }
  };

  const toggleSelectAll = () => {
    if (selected.length === options.length) {
      setSelected([]);
    } else {
      setSelected([...options]);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs h-[38px] shadow-sm hover:border-slate-300 cursor-pointer text-slate-700 font-semibold"
      >
        {Icon && <Icon size={14} style={{ color: SHOPEE_PALETTE.orange }} />}
        <span>
          {selected.length === 0
            ? `Todos (${label})`
            : `${label}: ${selected.length} selecionado(s)`}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-xl z-50 p-2 text-xs max-h-80 flex flex-col space-y-1.5">
          
          {/* Input de Busca */}
          <div className="relative px-1 pt-1 pb-0.5">
            <Search size={13} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={`Pesquisar ${label.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-orange-500 focus:bg-white text-slate-700"
            />
          </div>

          {/* Botão Selecionar Todos */}
          <div
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer font-bold border-b border-slate-100 text-slate-800 shrink-0"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${selected.length === options.length ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-300'}`}>
              {selected.length === options.length && <Check size={12} />}
            </div>
            <span>Selecionar Todos</span>
          </div>

          {/* Lista de Opções Filtradas */}
          <div className="overflow-y-auto space-y-0.5 max-h-48 pr-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const isChecked = selected.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-slate-700 font-medium"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-300'}`}>
                      {isChecked && <Check size={12} />}
                    </div>
                    <span className="truncate">{opt}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-slate-400 py-3 text-[11px]">Nenhum item encontrado</div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color, icon: Icon, highlight = false }) {
  return (
    <div className={`p-3.5 rounded-xl border flex flex-col justify-between shadow-sm transition-all ${
      highlight ? 'bg-teal-50/50 border-teal-200' : 'bg-slate-50 border-slate-200'
    }`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={14} style={{ color }} />}
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">{label}</span>
      </div>
      <span className="text-3xl font-black font-mono mt-1" style={{ color }}>{value}</span>
    </div>
  );
}

// =====================================================================
// COMPONENTE CPTCARD COM DESTAQUE AZUL PARA 'ARRIVED'
// =====================================================================
function CptCard({ item }) {
  const isArrived = String(item.status || '').trim().toLowerCase() === 'arrived';

  return (
    <div 
      className={`border p-2 rounded-lg text-center flex flex-col justify-between gap-1 shadow-sm transition-all ${
        isArrived 
          ? 'bg-blue-50/80 border-[#1665C4]' 
          : 'bg-white border-slate-200'
      }`}
    >
      <span className="font-bold text-slate-800 text-xs tracking-wide truncate" title={item.destino}>{item.destino}</span>
      <span 
        className="font-mono font-black text-xs" 
        style={{ color: isArrived ? SHOPEE_PALETTE.lightBlue : SHOPEE_PALETTE.blue }}
      >
        {item.cpt}
      </span>
      <span className="text-[10px] font-medium text-slate-400">{item.pacotes} pcts</span>
    </div>
  );
}

function DocaCard({ doca, horaAtual }) {
  const cptTheme = doca.ativa ? getCptTheme(doca.cpt, horaAtual) : NEUTRAL_THEME;

  return (
    <div 
      className="p-2 rounded-lg text-center flex flex-col justify-between gap-1 transition-all shadow-sm border-2"
      style={{
        backgroundColor: doca.ativa ? cptTheme.bg : '#F1F2F3',
        borderColor: doca.ativa ? cptTheme.border : '#E2E8F0',
      }}
    >
      <div className="flex items-center justify-center gap-1.5 font-mono font-bold text-xs">
        <span 
          className="w-2 h-2 rounded-full animate-pulse shadow-sm"
          style={{
            backgroundColor: doca.ativa ? cptTheme.text : '#CBD5E1',
          }} 
        />
        <span 
          className="font-black"
          style={{ color: doca.ativa ? cptTheme.text : '#64748B' }}
        >
          {doca.id}
        </span>
      </div>

      <span className={`font-bold text-xs tracking-wide truncate ${doca.ativa ? 'text-slate-800' : 'text-slate-400'}`} title={doca.veiculo}>
        {doca.ativa ? doca.veiculo : '-'}
      </span>

      <span className="font-mono text-[11px] font-black" style={{ color: doca.ativa ? cptTheme.text : '#94A3B8' }}>
        {doca.ativa ? doca.cpt : '-'}
      </span>
    </div>
  );
}

function RuaCard({ rua, mirrored = false }) {
  const pct = rua.capacidade_total > 0 ? (rua.total_ocupado / rua.capacidade_total) * 100 : 0;
  const numStr = rua.numero_rua_str;
  const theme = getStatusTheme(pct);
  const agingTheme = getAgingTheme(rua.aging_formatado);

  const numero = (
    <div className="font-mono text-slate-800 font-black text-xs md:text-sm w-12 text-center shrink-0 bg-slate-100 border border-slate-300 py-2.5 rounded-lg shadow-sm">
      {numStr}
    </div>
  );

  const dynamicBackground = getDynamicGradient(pct, mirrored);

  const barra = (
    <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 relative overflow-hidden shadow-sm">
      <div
        className={`absolute top-0 bottom-0 transition-all duration-500 ease-out z-0 ${
          mirrored ? 'border-l-2' : 'border-r-2'
        }`}
        style={{
          [mirrored ? 'right' : 'left']: 0,
          width: `${Math.min(pct, 100)}%`,
          background: dynamicBackground,
          borderColor: theme.border,
        }}
      />

      <div className={`relative z-10 flex items-center justify-between gap-3 w-full ${mirrored ? 'flex-row-reverse' : ''}`}>
        <span className={`font-black tracking-wide text-xs md:text-sm truncate flex-1 text-slate-900 ${mirrored ? 'text-right' : 'text-left'}`}>
          {rua.destino_exibicao}
        </span>

        <div className={`flex items-center gap-3.5 shrink-0 font-mono text-xs ${mirrored ? 'flex-row-reverse' : ''}`}>
          <span className="font-bold" style={{ color: agingTheme.text }}>
            {rua.aging_formatado || '0h 00min'}
          </span>

          <span className="text-slate-700 font-bold min-w-[35px] text-center">
            {rua.total_ocupado}/{rua.capacidade_total}
          </span>

          <span className="font-black text-sm min-w-[40px] text-right" style={{ color: theme.text }}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      {mirrored ? <>{barra}{numero}</> : <>{numero}{barra}</>}
    </div>
  );
}