import React, { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabase';
import { RefreshCw, Filter, Truck, Clock, Package, Layers, RotateCcw, ChevronDown, Check, Home } from 'lucide-react';

// =====================================================================
// DESIGN TOKENS - PALETA SHOPEE & REGRAS
// =====================================================================

const RUA_CAPACIDADE_PADRAO = 12;
const CPT_WINDOW_MINUTES = 120;
const AGING_ALERT_MINUTES = 240;

// Paleta Shopee Oficial
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
  { max: 33, text: '#218E7E', bg: 'rgba(33, 142, 126, 0.15)', border: '#218E7E' },   // Cyan / Verde
  { max: 66, text: '#E5A300', bg: 'rgba(229, 163, 0, 0.18)', border: '#E5A300' },   // Yellow / Amarelo
  { max: Infinity, text: '#B50220', bg: 'rgba(181, 2, 32, 0.22)', border: '#B50220' } // Red / Vermelho
];

const NEUTRAL_THEME = { text: '#94A3B8', border: '#E2E8F0', bg: 'transparent' };

function getStatusTheme(pct) {
  return STATUS_SCALE.find(s => pct <= s.max);
}

function parseAgingMinutes(agingStr) {
  const match = /^(\d+)h\s*(\d+)min$/.exec(agingStr || '');
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function getAgingTheme(agingStr) {
  const minutes = parseAgingMinutes(agingStr);
  const pct = Math.min((minutes / AGING_ALERT_MINUTES) * 100, 100);
  return getStatusTheme(pct);
}

function getCptTheme(cptTimeString, horaAtual) {
  if (!cptTimeString || cptTimeString === '-') return NEUTRAL_THEME;

  const [h, m] = cptTimeString.split(':').map(Number);
  const cptDate = new Date(horaAtual);
  cptDate.setHours(h, m, 0, 0);

  const diffMinutes = (cptDate - horaAtual) / (1000 * 60);

  if (diffMinutes >= CPT_WINDOW_MINUTES) return STATUS_SCALE[0];
  if (diffMinutes <= 0) return STATUS_SCALE[STATUS_SCALE.length - 1];

  const progressPct = ((CPT_WINDOW_MINUTES - diffMinutes) / CPT_WINDOW_MINUTES) * 100;
  return getStatusTheme(progressPct);
}

// Funcao auxiliar para calcular o gradiente dinamico conforme a % ocupada (0-33%, 34-66%, 67-100%)
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
// MOCKS DE DADOS
// =====================================================================

const MOCK_RUAS = Array.from({ length: 58 }, (_, i) => {
  const num = i + 1;
  if (num === 57) return null;

  const destinosExemplo = ['BETIM', 'SP_Santana', 'Louveira', 'Eunápolis_02', 'BA_Teixeira'];
  const destino = destinosExemplo[(num - 1) % destinosExemplo.length];

  const cap = RUA_CAPACIDADE_PADRAO;
  const totalOc = num === 2 ? 10 : num === 4 ? 6 : num === 1 ? 0 : (num % 5 === 0 ? 0 : (num * 3) % 13);

  const gaiolas = Math.floor(totalOc * 0.6);
  const scuttles = totalOc - gaiolas;
  const aging = num === 2 ? '19h 02min' : num === 4 ? '1h 30min' : num === 1 ? '0h 00min' : `${num % 12}h 15min`;

  return {
    id_rua: `RUA OUT ${String(num).padStart(3, '0')}`,
    numero_rua: num,
    destino,
    capacidade_total: cap,
    total_ocupado: totalOc,
    gaiolas,
    scuttles,
    aging_formatado: aging,
    status: 'Available'
  };
}).filter(Boolean);

const MOCK_DOCAS = [
  { id: 'EXT.OUT79', ativa: false },
  { id: 'EXT.OUT80', ativa: true, veiculo: 'VILA VELHA', cpt: '12:00' },
  { id: 'EXT.OUT81', ativa: true, veiculo: 'LOUVEIRA', cpt: '11:00' },
  { id: 'EXT.OUT82', ativa: false },
  { id: 'EXT.OUT83', ativa: true, veiculo: 'BETIM', cpt: '15:30' },
  { id: 'EXT.OUT84', ativa: false }
];

const MOCK_CPTS = [
  { destino: 'RJ', cpt: '14:00', pacotes: '1.240' },
  { destino: 'BETIM', cpt: '15:00', pacotes: '850' },
  { destino: 'BA', cpt: '16:00', pacotes: '2.100' },
  { destino: 'LOUVEIRA', cpt: '17:30', pacotes: '620' },
  { destino: 'EUNÁPOLIS', cpt: '19:00', pacotes: '410' },
  { destino: 'SOC_RJ', cpt: '21:15', pacotes: '1.180' }
];

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================

export default function App() {
  const [ruas, setRuas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ultimaSinc, setUltimaSinc] = useState('');
  
  // Filtros Multi-Seleção
  const [selectedDestinos, setSelectedDestinos] = useState([]);
  const [selectedRuas, setSelectedRuas] = useState([]);
  
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [ordenacao, setOrdenacao] = useState('numero');

  useEffect(() => {
    fetchRuas();
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function fetchRuas() {
    setLoading(true);
    const agora = new Date();
    setUltimaSinc(agora.toLocaleTimeString('pt-BR'));

    const { data, error } = await supabase
      .from('stage_out_ruas')
      .select('*')
      .order('numero_rua', { ascending: true });

    if (!error && data && data.length > 0) {
      setRuas(data);
    } else {
      setRuas(MOCK_RUAS);
    }
    setLoading(false);
  }

  const opcoesRuas = Array.from({ length: 58 }, (_, i) => i + 1)
    .filter(n => n !== 57)
    .map(n => String(n).padStart(3, '0'));

  const destinosUnicos = Array.from(new Set(ruas.map(r => r.destino).filter(Boolean))).sort();

  // Resetar Filtros
  const handleResetFilters = () => {
    setSelectedDestinos([]);
    setSelectedRuas([]);
  };

  const hasActiveFilters = selectedDestinos.length > 0 || selectedRuas.length > 0;

  // Filtragem
  const ruasFiltradas = ruas.filter(r => {
    const rNumStr = String(r.numero_rua).padStart(3, '0');
    
    const matchDestino = selectedDestinos.length === 0 || selectedDestinos.includes(r.destino);
    const matchRua = selectedRuas.length === 0 || selectedRuas.includes(rNumStr);
    
    return matchDestino && matchRua;
  });

  // Métricas
  const capacidadeTotal = ruasFiltradas.reduce((acc, r) => acc + (r.capacidade_total || 0), 0);
  const totalGaiolas = ruasFiltradas.reduce((acc, r) => acc + (r.gaiolas || 0), 0);
  const totalScuttles = ruasFiltradas.reduce((acc, r) => acc + (r.scuttles || 0), 0);
  const totalOcupado = totalGaiolas + totalScuttles;
  const pctOcupadaNum = capacidadeTotal > 0 ? (totalOcupado / capacidadeTotal) * 100 : 0;
  
  const ruasLivresCount = ruasFiltradas.filter(r => (r.total_ocupado || 0) === 0).length;

  // Ordenação das ruas
  const sortRuas = (list) => {
    return [...list].sort((a, b) => {
      const pctA = a.capacidade_total > 0 ? (a.total_ocupado / a.capacidade_total) : 0;
      const pctB = b.capacidade_total > 0 ? (b.total_ocupado / b.capacidade_total) : 0;
      const agingA = parseAgingMinutes(a.aging_formatado);
      const agingB = parseAgingMinutes(b.aging_formatado);

      if (ordenacao === 'aging') {
        if (agingB !== agingA) return agingB - agingA;
        return a.numero_rua - b.numero_rua;
      }

      if (ordenacao === 'ocupacao') {
        if (pctB !== pctA) return pctB - pctA;
        return a.numero_rua - b.numero_rua;
      }

      return a.numero_rua - b.numero_rua;
    });
  };

  const ruasPares = sortRuas(ruasFiltradas.filter(r => r.numero_rua % 2 === 0));
  const ruasImpares = sortRuas(ruasFiltradas.filter(r => r.numero_rua % 2 !== 0));

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-5 bg-white text-slate-800 font-sans">
      
      {/* CABEÇALHO */}
      <header className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <h1 className="text-2xl font-black tracking-wider uppercase font-mono" style={{ color: SHOPEE_PALETTE.navy }}>
            Overview Ruas <span className="text-slate-300">/</span> Stage Out
          </h1>

          {/* BARRA DE FILTROS E AÇÕES */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* DROPDOWN DESTINOS */}
            <MultiSelectDropdown
              label="Destinos"
              options={destinosUnicos}
              selected={selectedDestinos}
              setSelected={setSelectedDestinos}
              icon={Filter}
            />

            {/* DROPDOWN RUAS */}
            <MultiSelectDropdown
              label="Ruas"
              options={opcoesRuas}
              selected={selectedRuas}
              setSelected={setSelectedRuas}
              icon={Home}
            />

            {/* BOTÃO REDEFINIR FILTROS (SEMPRE VISÍVEL) */}
            <button
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition h-[38px] ${
                hasActiveFilters
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
              title={hasActiveFilters ? "Limpar todos os filtros" : "Nenhum filtro ativo"}
            >
              <RotateCcw size={14} />
              Limpar
            </button>

            {/* BOTÃO ATUALIZAR */}
            <button
              onClick={fetchRuas}
              className="flex items-center gap-1.5 text-white font-bold px-4 rounded-lg text-xs transition cursor-pointer shadow h-[38px] hover:opacity-90"
              style={{ backgroundColor: SHOPEE_PALETTE.orange }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>

            {/* HORÁRIO ATUAL */}
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
        <KpiCard label="% Ocupada" value={`${pctOcupadaNum.toFixed(1)}%`} color={getStatusTheme(pctOcupadaNum).text} />
        <KpiCard label="Ruas Livres" value={ruasLivresCount} color={SHOPEE_PALETTE.cyan} icon={Home} highlight />
      </div>

      {/* CPTS E DOCAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        
        {/* PRÓXIMOS CPTS */}
        <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: SHOPEE_PALETTE.blue }}>
            <Clock size={16} />
            <span>Próximos CPTs</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {MOCK_CPTS.map((item, idx) => (
              <CptCard key={idx} item={item} />
            ))}
          </div>
        </section>

        {/* DOCAS / VEÍCULOS DOCADOS */}
        <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: SHOPEE_PALETTE.cyan }}>
            <Truck size={16} />
            <span>Docas / Veículos Docados</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {MOCK_DOCAS.map(doca => (
              <DocaCard key={doca.id} doca={doca} horaAtual={horaAtual} />
            ))}
          </div>
        </section>

      </div>

      {/* GRID DAS RUAS */}
      <div className="pt-2 space-y-4">
        
        {/* TÍTULO CENTRALIZADO */}
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

            {/* PARES */}
            <div className="space-y-2.5">
              {ruasPares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4">Nenhuma rua par encontrada.</div>
              ) : (
                ruasPares.map(rua => <RuaCard key={rua.id_rua} rua={rua} />)
              )}
            </div>

            {/* ÍMPARES */}
            <div className="space-y-2.5">
              {ruasImpares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4 text-right">Nenhuma rua ímpar encontrada.</div>
              ) : (
                ruasImpares.map(rua => <RuaCard key={rua.id_rua} rua={rua} mirrored />)
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// =====================================================================
// DROPDOWN CUSTOMIZADO COM CHECKBOXES (MULTI-SELECT)
// =====================================================================

function MultiSelectDropdown({ label, options, selected, setSelected, icon: Icon }) {
  const [isOpen, setIsOpen] = useState(false);
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
        <div className="absolute right-0 mt-1 w-60 bg-white rounded-xl border border-slate-200 shadow-xl z-50 p-2 text-xs max-h-72 overflow-y-auto space-y-1">
          <div
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer font-bold border-b border-slate-100 text-slate-800"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${selected.length === options.length ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-300'}`}>
              {selected.length === options.length && <Check size={12} />}
            </div>
            <span>Selecionar Todos</span>
          </div>

          {options.map(opt => {
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
          })}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// COMPONENTES DE CARDS E KPIS
// =====================================================================

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

function CptCard({ item }) {
  return (
    <div className="bg-white border border-slate-200 p-2 rounded-lg text-center flex flex-col justify-between gap-1 shadow-sm">
      <span className="font-bold text-slate-800 text-xs tracking-wide truncate">{item.destino}</span>
      <span className="font-mono font-black text-xs" style={{ color: SHOPEE_PALETTE.blue }}>{item.cpt}</span>
      <span className="text-[10px] font-medium text-slate-400">{item.pacotes} pcts</span>
    </div>
  );
}

// DOCA CARD: Doca ativa usa o tom vibrante Cyan (#218E7E) com borda acentuada de 2px e brilho
function DocaCard({ doca, horaAtual }) {
  const cptTheme = doca.ativa ? getCptTheme(doca.cpt, horaAtual) : NEUTRAL_THEME;

  return (
    <div 
      className={`p-2 rounded-lg text-center flex flex-col justify-between gap-1 transition-all ${
        doca.ativa 
          ? 'bg-teal-50/40 border-2 border-[#218E7E] shadow-sm' 
          : 'bg-slate-100 border border-slate-200 text-slate-400'
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 font-mono font-bold text-xs">
        <span 
          className={`w-2 h-2 rounded-full ${
            doca.ativa 
              ? 'animate-pulse bg-[#218E7E] shadow-[0_0_8px_rgba(33,142,126,0.8)]' 
              : 'bg-slate-300'
          }`} 
        />
        <span className={doca.ativa ? 'text-[#218E7E] font-black' : 'text-slate-500'}>
          {doca.id.replace('EXT.', '')}
        </span>
      </div>

      <span className={`font-black text-xs truncate ${doca.ativa ? 'text-slate-800' : 'text-slate-400'}`}>
        {doca.ativa ? doca.veiculo : '-'}
      </span>

      <span className="font-mono text-[11px] font-bold" style={{ color: doca.ativa ? cptTheme.text : undefined }}>
        {doca.ativa ? doca.cpt : '-'}
      </span>
    </div>
  );
}

// =====================================================================
// CARD DE RUA COM GRADIENTE DINÂMICO POR PORCENTAGEM DE OCUPAÇÃO
// =====================================================================

function RuaCard({ rua, mirrored = false }) {
  const pct = rua.capacidade_total > 0 ? (rua.total_ocupado / rua.capacidade_total) * 100 : 0;
  const numStr = String(rua.numero_rua).padStart(3, '0');
  const theme = getStatusTheme(pct);
  const agingTheme = getAgingTheme(rua.aging_formatado);

  const numero = (
    <div className="font-mono text-slate-500 font-black text-base w-8 text-center shrink-0">
      {numStr}
    </div>
  );

  const dynamicBackground = getDynamicGradient(pct, mirrored);
  const nomeDestino = rua.destino || 'DESTINO_PADRÃO';

  const barra = (
    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 relative overflow-hidden shadow-sm">
      
      {/* Barra de Preenchimento de Gradiente */}
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
        
        {/* Nome do Destino */}
        <span className={`font-black tracking-wide text-sm truncate flex-1 text-slate-800 ${mirrored ? 'text-right' : 'text-left'}`}>
          {nomeDestino}
        </span>

        {/* Métricas */}
        <div className={`flex items-center gap-4 shrink-0 font-mono text-xs ${mirrored ? 'flex-row-reverse' : ''}`}>
          
          <span className="font-bold" style={{ color: agingTheme.text }}>
            {rua.aging_formatado || '0h 00min'}
          </span>

          <span className="text-slate-600 font-bold min-w-[40px] text-center">
            {rua.total_ocupado}/{rua.capacidade_total}
          </span>

          <span className="font-black text-sm min-w-[42px] text-right" style={{ color: theme.text }}>
            {pct.toFixed(0)}%
          </span>

        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2.5">
      {mirrored ? <>{barra}{numero}</> : <>{numero}{barra}</>}
    </div>
  );
}
