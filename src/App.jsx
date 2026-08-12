import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { RefreshCw, Filter, Truck, Clock, Package, Layers } from 'lucide-react';

// =====================================================================
// DESIGN TOKENS
// =====================================================================

const RUA_CAPACIDADE_PADRAO = 12;
const CPT_WINDOW_MINUTES = 120;
const AGING_ALERT_MINUTES = 240;

const STATUS_SCALE = [
  { max: 30, text: '#10b981', bg: 'rgba(16, 185, 129, 0.18)', border: '#10b981' },   // Emerald
  { max: 60, text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.18)', border: '#f59e0b' },   // Amber
  { max: 85, text: '#f97316', bg: 'rgba(249, 115, 22, 0.22)', border: '#f97316' },   // Orange
  { max: Infinity, text: '#f43f5e', bg: 'rgba(244, 63, 94, 0.25)', border: '#f43f5e' } // Rose
];

const NEUTRAL_THEME = { text: '#475569', border: '#334155', bg: 'transparent' };

const BRAND = '#f59e0b';
const TIME_ACCENT = '#22d3ee';

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

// =====================================================================
// MOCKS
// =====================================================================

const MOCK_RUAS = Array.from({ length: 58 }, (_, i) => {
  const num = i + 1;
  if (num === 57) return null;

  const destinosExemplo = ['BETIM', 'SP_Santana', 'Louveira', 'Eunápolis_02', 'BA_Teixeira'];
  const destino = num === 2 ? 'BETIM' : num === 4 ? 'SP_Santana' : num === 1 ? 'BA_Teixeira' : destinosExemplo[num % destinosExemplo.length];

  const cap = RUA_CAPACIDADE_PADRAO;
  const totalOc = num === 2 ? 10 : num === 4 ? 6 : num === 1 ? 0 : (num * 3) % 13;

  const gaiolas = Math.floor(totalOc * 0.6);
  const scuttles = totalOc - gaiolas;
  const aging = num === 2 ? '19h 02min' : num === 4 ? '1h 30min' : num === 1 ? '0h 00min' : `${num}h 15min`;

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
// APP
// =====================================================================

export default function App() {
  const [ruas, setRuas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ultimaSinc, setUltimaSinc] = useState('');
  const [filtroDestino, setFiltroDestino] = useState('');
  const [filtroRua, setFiltroRua] = useState('');
  const [horaAtual, setHoraAtual] = useState(new Date());

  // Estado da Ordenação: 'numero' | 'aging' | 'ocupacao'
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

  const ruasFiltradas = ruas.filter(r => {
    const rNumStr = String(r.numero_rua).padStart(3, '0');
    const matchDestino = filtroDestino ? (r.destino || '').includes(filtroDestino) : true;
    const matchRua = filtroRua ? rNumStr === filtroRua : true;
    return matchDestino && matchRua;
  });

  const capacidadeTotal = ruasFiltradas.reduce((acc, r) => acc + (r.capacidade_total || 0), 0);
  const totalGaiolas = ruasFiltradas.reduce((acc, r) => acc + (r.gaiolas || 0), 0);
  const totalScuttles = ruasFiltradas.reduce((acc, r) => acc + (r.scuttles || 0), 0);
  const totalOcupado = totalGaiolas + totalScuttles;
  const pctOcupadaNum = capacidadeTotal > 0 ? (totalOcupado / capacidadeTotal) * 100 : 0;

  // Função genérica para ordenar ruas
  const sortRuas = (list) => {
    return [...list].sort((a, b) => {
      const pctA = a.capacidade_total > 0 ? (a.total_ocupado / a.capacidade_total) : 0;
      const pctB = b.capacidade_total > 0 ? (b.total_ocupado / b.capacidade_total) : 0;
      const agingA = parseAgingMinutes(a.aging_formatado);
      const agingB = parseAgingMinutes(b.aging_formatado);

      if (ordenacao === 'aging') {
        if (agingB !== agingA) return agingB - agingA;
        return a.numero_rua - b.numero_rua; // Desempate por número
      }

      if (ordenacao === 'ocupacao') {
        if (pctB !== pctA) return pctB - pctA;
        return a.numero_rua - b.numero_rua; // Desempate por número
      }

      // Padrão: por número
      return a.numero_rua - b.numero_rua;
    });
  };

  const ruasPares = sortRuas(ruasFiltradas.filter(r => r.numero_rua % 2 === 0));
  const ruasImpares = sortRuas(ruasFiltradas.filter(r => r.numero_rua % 2 !== 0));

  return (
    <div
      className="min-h-screen p-4 md:p-6 space-y-5 bg-slate-950 text-slate-100"
      style={{
        backgroundImage:
          'linear-gradient(rgba(148,163,184,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.035) 1px, transparent 1px)',
        backgroundSize: '28px 28px'
      }}
    >
      {/* CABEÇALHO */}
      <header className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-lg space-y-2">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <h1 className="text-2xl font-black tracking-wider uppercase font-mono" style={{ color: BRAND }}>
            Overview Ruas <span className="text-slate-600">/</span> Stage Out
          </h1>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs h-[38px]">
              <Filter size={14} style={{ color: BRAND }} />
              <select
                value={filtroDestino}
                onChange={e => setFiltroDestino(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-medium"
              >
                <option value="" className="bg-slate-900">Todos os Destinos</option>
                {destinosUnicos.map(dest => (
                  <option key={dest} value={dest} className="bg-slate-900">{dest}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs h-[38px]">
              <span className="text-slate-500 font-semibold">Rua:</span>
              <select
                value={filtroRua}
                onChange={e => setFiltroRua(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-medium"
              >
                <option value="" className="bg-slate-900">Todas</option>
                {opcoesRuas.map(num => (
                  <option key={num} value={num} className="bg-slate-900">{num}</option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchRuas}
              className="flex items-center gap-1.5 hover:brightness-110 text-slate-950 font-bold px-4 rounded-lg text-xs transition cursor-pointer shadow h-[38px]"
              style={{ backgroundColor: BRAND }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>

            <div
              className="flex items-center gap-2 bg-slate-950 px-3.5 rounded-lg border border-slate-800 font-mono font-bold text-sm h-[38px] shadow-inner"
              style={{ color: BRAND }}
            >
              <Clock size={15} className="animate-pulse" style={{ color: BRAND }} />
              <span>{horaAtual.toLocaleTimeString('pt-BR')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-800/60">
          <p>Monitoramento Operacional em Tempo Real</p>
          {ultimaSinc && <span className="font-mono text-[11px]">Última sync: {ultimaSinc}</span>}
        </div>
      </header>

      {/* CARDS KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Capacidade Total" value={capacidadeTotal} color={BRAND} />
        <KpiCard label="Gaiolas" value={totalGaiolas} color="#c084fc" icon={Package} />
        <KpiCard label="Scuttles" value={totalScuttles} color="#818cf8" icon={Layers} />
        <KpiCard label="Total Ocupado" value={totalOcupado} color="#38bdf8" />
        <KpiCard label="% Ocupada" value={`${pctOcupadaNum.toFixed(1)}%`} color={getStatusTheme(pctOcupadaNum).text} />
      </div>

      {/* CPTS E DOCAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        <section className="bg-slate-900/90 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: TIME_ACCENT }}>
            <Clock size={16} />
            <span>Próximos CPTs</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {MOCK_CPTS.map((item, idx) => (
              <CptCard key={idx} item={item} />
            ))}
          </div>
        </section>

        <section className="bg-slate-900/90 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold text-sky-400 uppercase text-xs">
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
      <div className="pt-2 space-y-3">
        {/* TITULO CENTRALIZADO */}
        <div className="flex items-center justify-center gap-4 w-full">
          <div className="h-[1px] bg-slate-800 flex-1" />
          <h2
            className="text-sm font-black tracking-widest uppercase bg-slate-900 px-4 py-1 rounded-full border border-slate-800"
            style={{ color: BRAND }}
          >
            Stage Out — Ruas
          </h2>
          <div className="h-[1px] bg-slate-800 flex-1" />
        </div>

        {/* CABEÇALHO DA GRID: PARES, BOTÕES DE ORDENAÇÃO E ÍMPARES NA MESMA LINHA */}
        <div className="flex items-center justify-between px-1 text-xs">
          {/* LADO ESQUERDO: PARES */}
          <div className="font-semibold text-slate-500 uppercase tracking-wider">
            Pares
          </div>

          {/* CENTRO: BOTÕES SEM O TEXTO "ORDENAR POR:" */}
          <div className="flex items-center justify-center gap-1.5 font-semibold">
            <button
              onClick={() => setOrdenacao('numero')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer border ${
                ordenacao === 'numero'
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold shadow'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              Número
            </button>

            <button
              onClick={() => setOrdenacao('aging')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer border ${
                ordenacao === 'aging'
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold shadow'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              Aging
            </button>

            <button
              onClick={() => setOrdenacao('ocupacao')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer border ${
                ordenacao === 'ocupacao'
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold shadow'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              Ocupação
            </button>
          </div>

          {/* LADO DIREITO: ÍMPARES */}
          <div className="font-semibold text-slate-500 uppercase tracking-wider">
            Ímpares
          </div>
        </div>

        {/* LISTAGEM DAS RUAS */}
        {ruasFiltradas.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-10 border border-dashed border-slate-800 rounded-lg">
            Nenhuma rua encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="hidden lg:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l border-dashed border-slate-800" />

            <div className="space-y-2.5">
              {ruasPares.length === 0 ? (
                <div className="text-xs text-slate-600 italic px-1 py-4">Nenhuma rua par no filtro atual.</div>
              ) : (
                ruasPares.map(rua => <RuaCard key={rua.id_rua} rua={rua} />)
              )}
            </div>

            <div className="space-y-2.5">
              {ruasImpares.length === 0 ? (
                <div className="text-xs text-slate-600 italic px-1 py-4 text-right">Nenhuma rua ímpar no filtro atual.</div>
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
// COMPONENTES AUXILIARES
// =====================================================================

function KpiCard({ label, value, color, icon: Icon }) {
  return (
    <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={14} style={{ color }} />}
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-3xl font-black font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

function CptCard({ item }) {
  return (
    <div
      className="bg-slate-950/70 border p-2 rounded-lg text-center flex flex-col justify-between gap-1 shadow-sm"
      style={{ borderColor: 'rgba(34, 211, 238, 0.3)' }}
    >
      <span className="font-black text-slate-100 text-xs tracking-wide truncate">{item.destino}</span>
      <span className="font-mono font-bold text-[11px]" style={{ color: TIME_ACCENT }}>{item.cpt}</span>
      <span className="text-[10px] font-semibold text-slate-500">{item.pacotes} pcts</span>
    </div>
  );
}

function DocaCard({ doca, horaAtual }) {
  const theme = doca.ativa ? getCptTheme(doca.cpt, horaAtual) : NEUTRAL_THEME;

  return (
    <div
      className={`p-2 rounded-lg border text-center flex flex-col justify-between gap-1 transition-all ${
        doca.ativa ? 'bg-slate-950/80 shadow-sm' : 'bg-slate-950/50 border-slate-800 text-slate-600'
      }`}
      style={{ borderColor: doca.ativa ? theme.border : undefined }}
    >
      <div className="flex items-center justify-center gap-1 font-mono font-bold text-xs">
        <span
          className={`w-2 h-2 rounded-full ${doca.ativa ? 'animate-pulse' : 'bg-slate-600'}`}
          style={{ backgroundColor: doca.ativa ? theme.text : undefined }}
        />
        <span className="text-slate-300">{doca.id.replace('EXT.', '')}</span>
      </div>

      <span className={`font-bold text-xs truncate ${doca.ativa ? 'text-slate-100' : 'text-slate-600'}`}>
        {doca.ativa ? doca.veiculo : '-'}
      </span>

      <span className="font-mono text-[11px] font-bold" style={{ color: theme.text }}>
        {doca.ativa ? doca.cpt : '-'}
      </span>
    </div>
  );
}

// Card Único de Rua com Novo Estilo de Barra (Glassmorphism + Neon Border)
function RuaCard({ rua, mirrored = false }) {
  const pct = rua.capacidade_total > 0 ? (rua.total_ocupado / rua.capacidade_total) * 100 : 0;
  const numStr = String(rua.numero_rua).padStart(3, '0');
  const theme = getStatusTheme(pct);
  const agingTheme = getAgingTheme(rua.aging_formatado);

  const numero = (
    <div className="font-mono text-slate-400 font-black text-lg w-9 text-center shrink-0">
      {numStr}
    </div>
  );

  const barra = (
    <div className="flex-1 bg-slate-900/90 border border-slate-800/90 rounded-lg p-3.5 relative overflow-hidden text-base shadow-sm">
      {/* Barra de Preenchimento Neon Limpo */}
      <div
        className={`absolute top-0 bottom-0 transition-all duration-500 ease-out z-0 ${
          mirrored ? 'border-l-2' : 'border-r-2'
        }`}
        style={{
          [mirrored ? 'right' : 'left']: 0,
          width: `${Math.min(pct, 100)}%`,
          backgroundColor: theme.bg,
          borderColor: theme.border,
          boxShadow: pct > 0 ? `0 0 10px ${theme.bg}` : 'none'
        }}
      />

      <div className={`relative z-10 flex items-center justify-between gap-4 w-full ${mirrored ? 'flex-row-reverse' : ''}`}>
        <span className={`font-black text-slate-100 tracking-wide text-lg truncate flex-1 ${mirrored ? 'text-right' : 'text-left'}`}>
          {rua.destino || 'LIVRE'}
        </span>

        <div className={`flex items-center gap-6 shrink-0 font-mono ${mirrored ? 'flex-row-reverse' : ''}`}>
          <span className="font-bold text-base" style={{ color: agingTheme.text }}>
            {rua.aging_formatado || '0h 00min'}
          </span>

          <span className="text-slate-300 font-bold text-base min-w-[45px] text-center">
            {rua.total_ocupado}/{rua.capacidade_total}
          </span>

          <span className="font-black text-lg min-w-[48px] text-right" style={{ color: theme.text }}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-3">
      {mirrored ? <>{barra}{numero}</> : <>{numero}{barra}</>}
    </div>
  );
}