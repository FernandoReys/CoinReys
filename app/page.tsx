"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Transaction = { id: string; title: string; category: string; amount: number; kind: "income" | "expense"; occurredAt: string };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAuth, setShowAuth] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showTransaction, setShowTransaction] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [toast, setToast] = useState("");
  const [goalPrice, setGoalPrice] = useState(0);
  const [goalYears, setGoalYears] = useState(1);
  const [monthlySave, setMonthlySave] = useState(0);
  const [profileName, setProfileName] = useState("Minha conta");
  const [profilePhoto, setProfilePhoto] = useState("");
  const income = useMemo(() => transactions.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0), [transactions]);
  const expense = useMemo(() => transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0), [transactions]);
  const balance = income - expense;
  const bills = useMemo(() => transactions.filter((item) => item.category === "Conta do mês").sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()), [transactions]);
  const billsTotal = useMemo(() => bills.reduce((sum, item) => sum + item.amount, 0), [bills]);
  const futureValue = Math.round(goalPrice * Math.pow(1.06, goalYears));
  const projected = monthlySave * 12 * goalYears * 1.055;
  const hasGoal = goalPrice > 0 && monthlySave > 0;
  const feasible = hasGoal && projected >= futureValue * 0.2;
  const chart = useMemo(() => {
    const latest = transactions.reduce((date, item) => Math.max(date, new Date(item.occurredAt).getTime()), Date.now());
    const reference = new Date(latest);
    const months = Array.from({ length: 6 }, (_, index) => new Date(reference.getFullYear(), reference.getMonth() - (5 - index), 1));
    const monthlyTotals = new Map(months.map((date) => [`${date.getFullYear()}-${date.getMonth()}`, 0]));
    transactions.forEach((item) => {
      const date = new Date(item.occurredAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (monthlyTotals.has(key)) monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + (item.kind === "income" ? item.amount : -item.amount));
    });
    const balances = months.map((date) => monthlyTotals.get(`${date.getFullYear()}-${date.getMonth()}`) ?? 0);
    const min = Math.min(...balances, 0);
    const max = Math.max(...balances, 0);
    const range = Math.max(max - min, 1);
    const points = balances.map((value, index) => {
      const x = 18 + (index * 404) / Math.max(balances.length - 1, 1);
      const y = 150 - ((value - min) / range) * 112;
      return { x, y };
    });
    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = `18,150 ${line} 422,150`;
    const labels = months.map((date) => new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""));
    return { points, line, area, labels, hasData: transactions.length > 0 };
  }, [transactions]);

  useEffect(() => {
    const savedName = window.localStorage.getItem("coinreys-profile-name");
    const savedPhoto = window.localStorage.getItem("coinreys-profile-photo");
    if (savedName) setProfileName(savedName);
    if (savedPhoto) setProfilePhoto(savedPhoto);
    if (!supabase) return;
    const client = supabase;
    void client.auth.getUser().then(({ data }) => { setUserId(data.user?.id ?? null); setShowAuth(!data.user); });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => { setUserId(session?.user?.id ?? null); setShowAuth(!session?.user); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !userId) { setTransactions([]); return; }
    const client = supabase;
    const load = async () => {
      const { data, error } = await client.from("coinreys_transactions").select("id,title,category,amount,kind,occurred_at").order("occurred_at", { ascending: false });
      if (error) { setToast("Não foi possível carregar os dados do painel."); return; }
      setTransactions((data ?? []).map((item) => ({ id: item.id, title: item.title, category: item.category, amount: Number(item.amount), kind: item.kind as "income" | "expense", occurredAt: item.occurred_at })));
    };
    void load();
    const channel = client.channel(`coinreys-${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "coinreys_transactions", filter: `user_id=eq.${userId}` }, load).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [userId]);

  function message(value: string) { setToast(value); window.setTimeout(() => setToast(""), 3600); }
  function navigateTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { message("A conexão com o banco ainda não foi configurada."); return; }
    const form = new FormData(event.currentTarget); const email = String(form.get("email")); const password = String(form.get("password"));
    const request = authMode === "login" ? supabase.auth.signInWithPassword({ email, password }) : supabase.auth.signUp({ email, password });
    void request.then(({ error }) => {
      if (error) message(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      else if (authMode === "signup") { setAuthMode("login"); message("Conta criada. Agora entre com seu e-mail e senha."); }
      else { setShowAuth(false); message("Acesso liberado."); }
    });
  }
  function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) { setShowTransaction(false); setShowAuth(true); return; }
    const form = new FormData(event.currentTarget);
    void supabase.from("coinreys_transactions").insert({ user_id: userId, title: String(form.get("title")), category: String(form.get("category")), amount: Number(form.get("amount")), kind: String(form.get("kind")) }).then(({ error }) => {
      if (error) message("Não foi possível salvar a movimentação.");
      else { setShowTransaction(false); message("Movimentação salva."); }
    });
  }
  function addBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) { setShowBill(false); setShowAuth(true); return; }
    const form = new FormData(event.currentTarget);
    void supabase.from("coinreys_transactions").insert({ user_id: userId, title: String(form.get("title")), category: "Conta do mês", amount: Number(form.get("amount")), kind: "expense", occurred_at: `${String(form.get("dueDate"))}T12:00:00` }).then(({ error }) => {
      if (error) message("Não foi possível salvar a conta.");
      else { setShowBill(false); message("Conta adicionada ao mês."); }
    });
  }
  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("profileName") || "").trim();
    if (!name) { message("Digite um nome para o seu perfil."); return; }
    setProfileName(name);
    window.localStorage.setItem("coinreys-profile-name", name);
    window.localStorage.setItem("coinreys-profile-photo", profilePhoto);
    setShowSettings(false);
    message("Perfil atualizado.");
  }
  function handleProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { message("Escolha um arquivo de imagem."); return; }
    const reader = new FileReader();
    reader.onload = () => setProfilePhoto(String(reader.result));
    reader.readAsDataURL(file);
  }
  async function logout() { if (supabase) await supabase.auth.signOut(); setTransactions([]); setShowAuth(true); }

  return <main className="app-shell">
    <aside className="sidebar"><a className="brand" href="#inicio" onClick={() => navigateTo("overview")}><span className="brand-mark">CR</span><span>coin<span>Reys</span></span></a><div className="workspace"><span className="dot" /> Minha vida financeira</div><nav>{[{ id: "overview", icon: "▦", label: "Visão geral" }, { id: "movimentacoes", icon: "↕", label: "Movimentações" }, { id: "contas", icon: "▣", label: "Contas do mês" }, { id: "orcamentos", icon: "▤", label: "Orçamentos" }, { id: "sonhos", icon: "✦", label: "Sonhos e Metas" }].map((item) => <button key={item.id} onClick={() => navigateTo(item.id)} className={activeSection === item.id ? "nav-item active" : "nav-item"}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item" onClick={() => setShowSettings(true)}><span className="nav-icon">⚙</span>Configurações</button><button className="nav-item" onClick={() => void logout()}><span className="nav-icon">↪</span>Sair</button><button className="profile profile-button" onClick={() => setShowSettings(true)} aria-label="Editar perfil">{profilePhoto ? <img src={profilePhoto} className="avatar-photo" alt="Foto de perfil" /> : <div className="avatar">{profileName.slice(0, 2).toUpperCase()}</div>}<div><strong>{profileName}</strong><small>{userId ? "Acesso protegido" : "Entre para começar"}</small></div><span>⚙</span></button></div></aside>
    <section className="content" id="inicio"><header className="topbar"><div><p className="eyebrow">Painel financeiro</p><h1>Seu dinheiro, no controle.</h1></div><div className="top-actions"><button className="month-button">◷ Período atual</button><button className="new-button" onClick={() => userId ? setShowTransaction(true) : setShowAuth(true)}>＋ Nova movimentação</button></div></header>
      <section className="hero-card" id="overview"><div className="hero-copy"><p>Seu saldo disponível</p><h2>{money(balance)}</h2><div className="positive-pill"><span>{transactions.length ? "Dados atualizados em tempo real" : "Comece registrando uma movimentação"}</span></div><p className="helper">Seus registros ficam privados na sua conta.</p></div><div className="hero-chart"><div className="chart-label">Resultado por mês</div>{chart.hasData ? <div className="live-chart"><svg viewBox="0 0 440 180" role="img" aria-label="Gráfico do resultado mensal"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#56f78b" stopOpacity=".34"/><stop offset="100%" stopColor="#56f78b" stopOpacity="0"/></linearGradient><filter id="chartGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><line x1="18" y1="38" x2="422" y2="38" className="grid"/><line x1="18" y1="94" x2="422" y2="94" className="grid"/><line x1="18" y1="150" x2="422" y2="150" className="grid"/><polygon points={chart.area} fill="url(#chartFill)"/><polyline points={chart.line} className="live-line" filter="url(#chartGlow)"/>{chart.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index === chart.points.length - 1 ? 5 : 3.2} className="chart-point"/>)}</svg></div> : <div className="empty-chart"><span>Adicione uma movimentação para ver seu resultado mensal.</span></div>}<div className="chart-period month-labels">{chart.labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></div></section>
      <section className="metric-grid"><article className="metric-card income"><div className="metric-icon">↙</div><p>Entradas no mês</p><h3>{money(income)}</h3><small>Valores registrados</small></article><article className="metric-card expense"><div className="metric-icon">↗</div><p>Saídas no mês</p><h3>{money(expense)}</h3><small>Valores registrados</small></article><article className="metric-card goal"><div className="metric-icon">◌</div><p>Taxa de economia</p><h3>{income ? Math.max(0, Math.round((balance / income) * 100)) : 0}%</h3><small>Calculada automaticamente</small></article></section>
      <section className="dashboard-grid"><article className="panel transactions-panel" id="movimentacoes"><div className="panel-head"><div><p className="eyebrow">Movimentações</p><h2>Atividade recente</h2></div><button onClick={() => userId ? setShowTransaction(true) : setShowAuth(true)}>Adicionar →</button></div><div className="transaction-list">{transactions.length ? transactions.slice(0, 5).map((item) => <div className="transaction" key={item.id}><div className={item.kind === "income" ? "transaction-icon gain" : "transaction-icon loss"}>{item.kind === "income" ? "↓" : "↑"}</div><div className="transaction-title"><strong>{item.title}</strong><span>{item.category} · {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(item.occurredAt))}</span></div><strong className={item.kind === "income" ? "value gain-text" : "value loss-text"}>{item.kind === "income" ? "+" : "−"}{money(item.amount)}</strong></div>) : <p className="empty-state">Nenhuma movimentação registrada ainda.</p>}</div></article><article className="panel bills-panel" id="contas"><div className="panel-head"><div><p className="eyebrow">Planejamento</p><h2>Contas do mês</h2></div><button onClick={() => userId ? setShowBill(true) : setShowAuth(true)}>Adicionar →</button></div><div className="bill-total"><span>Faltam pagar</span><strong>{money(billsTotal)}</strong><small>{bills.length ? `${bills.length} conta${bills.length > 1 ? "s" : ""} cadastrada${bills.length > 1 ? "s" : ""}.` : "Adicione suas contas conforme precisar."}</small></div>{bills.length ? <div className="bill-list">{bills.slice(0, 4).map((bill) => <div className="bill-item" key={bill.id}><span className="bill-icon">◷</span><div><strong>{bill.title}</strong><small>Vence em {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(bill.occurredAt))}</small></div><b>{money(bill.amount)}</b></div>)}</div> : <p className="empty-state">Sem contas cadastradas.</p>}</article></section>
      <section className="panel budget-panel" id="orcamentos"><div className="panel-head"><div><p className="eyebrow">Orçamentos</p><h2>Distribuição das despesas</h2></div></div><p className="empty-state">Cadastre movimentações para o CoinReys organizar seus gastos por categoria.</p></section>
      <section className="dreams" id="sonhos"><div className="dreams-heading"><div><p className="eyebrow">Sonhos e Metas</p><h2>Planeje seus próximos passos.</h2><p>Simule compras importantes de um jeito simples.</p></div><span className="section-index">05</span></div><div className="dream-layout"><div className="dream-form"><label>Meu objetivo<select defaultValue="Casa própria"><option>Casa própria</option><option>Carro novo</option><option>Moto</option><option>Viagem</option><option>Outro sonho</option></select></label><label>Valor hoje<div className="input-prefix"><span>R$</span><input type="number" min="0" value={goalPrice || ""} placeholder="0,00" onChange={(event) => setGoalPrice(Number(event.target.value))}/></div></label><label>Quero realizar em<div className="range-label"><input type="range" min="1" max="10" value={goalYears} onChange={(event) => setGoalYears(Number(event.target.value))}/><b>{goalYears} anos</b></div></label><label>Quanto consigo guardar por mês<div className="input-prefix"><span>R$</span><input type="number" min="0" value={monthlySave || ""} placeholder="0,00" onChange={(event) => setMonthlySave(Number(event.target.value))}/></div></label></div><div className="dream-result">{hasGoal ? <><div className={feasible ? "verdict feasible" : "verdict caution"}>{feasible ? "Plano viável" : "Ajuste necessário"}</div><h3>{feasible ? "Seu objetivo está no planejamento." : "Ajuste o valor ou o prazo."}</h3><p>Com valorização estimada de 6% ao ano, seu objetivo pode custar:</p><strong>{money(futureValue)}</strong><div className="projection"><span>Reserva estimada</span><b>{money(projected)}</b><small>em {goalYears} anos.</small></div></> : <><div className="verdict caution">Aguardando dados</div><h3>Preencha os valores da sua meta.</h3><p>O CoinReys calcula seu cenário automaticamente.</p></>}</div></div></section>
    </section>
    {showTransaction && <div className="modal-backdrop"><form className="transaction-modal" onSubmit={addTransaction}><button type="button" className="close" onClick={() => setShowTransaction(false)}>×</button><p className="eyebrow">Nova movimentação</p><h2>Registre em poucos segundos</h2><label>Tipo<select name="kind"><option value="expense">Saída</option><option value="income">Entrada</option></select></label><label>Descrição<input name="title" required placeholder="Ex.: Mercado" /></label><label>Categoria<input name="category" required placeholder="Ex.: Alimentação" /></label><label>Valor<input name="amount" required min="0.01" step="0.01" type="number" placeholder="0,00" /></label><button className="save-button">Salvar movimentação</button></form></div>}
    {showBill && <div className="modal-backdrop"><form className="transaction-modal" onSubmit={addBill}><button type="button" className="close" onClick={() => setShowBill(false)}>×</button><p className="eyebrow">Contas do mês</p><h2>Adicionar uma conta</h2><label>Nome da conta<input name="title" required placeholder="Ex.: Internet" /></label><label>Vencimento<input name="dueDate" type="date" required /></label><label>Valor<input name="amount" required min="0.01" step="0.01" type="number" placeholder="0,00" /></label><button className="save-button">Adicionar conta</button></form></div>}
    {showSettings && <div className="modal-backdrop"><form className="transaction-modal settings-modal" onSubmit={saveSettings}><button type="button" className="close" onClick={() => setShowSettings(false)}>×</button><p className="eyebrow">Configurações</p><h2>Seu perfil</h2><div className="photo-editor">{profilePhoto ? <img src={profilePhoto} alt="Prévia da foto de perfil" /> : <div className="photo-placeholder">{profileName.slice(0, 2).toUpperCase()}</div>}<label className="photo-upload">Trocar foto<input type="file" accept="image/*" onChange={handleProfilePhoto} /></label></div><label>Nome que aparece no painel<input name="profileName" defaultValue={profileName} maxLength={40} required placeholder="Ex.: Nando Reis" /></label><p className="settings-note">Seu nome e foto ficam guardados neste dispositivo.</p><button className="save-button">Salvar perfil</button></form></div>}
    {showAuth && <div className="modal-backdrop"><form className="transaction-modal" onSubmit={authenticate}><p className="eyebrow">Acesso ao CoinReys</p><h2>{authMode === "login" ? "Entre na sua conta" : "Crie sua conta"}</h2><label>Seu e-mail<input name="email" type="email" required placeholder="voce@email.com" /></label><label>Senha<input name="password" type="password" minLength={6} required placeholder="Mínimo de 6 caracteres" /></label><button className="save-button">{authMode === "login" ? "Entrar" : "Criar conta"}</button><button type="button" className="auth-switch" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}</button></form></div>}
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}
