import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import jsPDF from "jspdf";
import logoLoja from "./assets/logo-loja.jpeg";

type Grau = "Mestre" | "Companheiro" | "Aprendiz" | "";

type Membro = {
  id: string;
  nome: string;
  grau: Grau | string;
  presenca: number;
};

type Selecoes = Record<string, string>;

const CARGOS = [
  "Venerável Mestre",
  "1º Vigilante",
  "2º Vigilante",
  "Orador",
  "Tesoureiro",
  "Secretário",
  "Chanceler",
  "Mestre de Cerimônias",
  "1º Diácono",
  "2º Diácono",
  "Hospitaleiro",
  "Guarda do Templo"
];

const COMISSOES = ["Assuntos Gerais", "Finanças", "Solidariedade"];

const PRESENCA_MINIMA: Record<string, number> = {
  "Venerável Mestre": 75,
  "1º Vigilante": 75,
  "2º Vigilante": 75,
  Orador: 50,
  Tesoureiro: 50,
  Secretário: 50,
  Chanceler: 50,
  "Mestre de Cerimônias": 50,
  "1º Diácono": 50,
  "2º Diácono": 50,
  Hospitaleiro: 50,
  "Guarda do Templo": 50
};

const INITIAL_FORM: Omit<Membro, "id"> = {
  nome: "",
  grau: "Mestre",
  presenca: 0
};

function normalizeGrau(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value.includes("mestre")) return "Mestre";
  if (value.includes("companheiro")) return "Companheiro";
  if (value.includes("aprendiz")) return "Aprendiz";
  return "";
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value ?? "0").replace("%", "").replace(",", ".").trim();
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function inferGrauFromRow(row: Record<string, unknown>) {
  const possibleFields = [
    row.Grau,
    row.grau,
    row["Irmão"],
    row.Irmao,
    row["Irmão / Nome"],
    row.Nome,
    row.nome,
    row.Membro,
    row.membro
  ];

  for (const field of possibleFields) {
    const grau = normalizeGrau(field);
    if (grau) return grau;
  }

  return "";
}

function inferNomeFromRow(row: Record<string, unknown>) {
  const candidates = [
    row.Nome,
    row.nome,
    row["Irmão"],
    row.Irmao,
    row["Irmão / Nome"],
    row.Membro,
    row.membro
  ];

  for (const field of candidates) {
    const text = String(field ?? "").trim();
    if (!text) continue;
    return text
      .replace(/\s*-\s*(Aprendiz|Companheiro|Mestre)\b/gi, "")
      .replace(/\s+-\s*\d+\b/g, "")
      .trim();
  }

  return "";
}

function isCargoElegivel(m: Membro, cargo: string) {
  return normalizeGrau(m.grau) === "Mestre" && m.presenca >= PRESENCA_MINIMA[cargo];
}

function badgeClass(kind: "ok" | "warn" | "error") {
  if (kind === "ok") return "bg-green-100 text-green-800 border-green-200";
  if (kind === "warn") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-red-100 text-red-800 border-red-200";
}

export default function App() {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selecoes, setSelecoes] = useState<Selecoes>({});
  const [comissoes, setComissoes] = useState<Record<string, string[]>>({
    "Assuntos Gerais": [],
    Finanças: [],
    Solidariedade: []
  });
  const [loading, setLoading] = useState(false);
  const [ocrText, setOcrText] = useState("");

  const mestresElegiveis = useMemo(
    () => membros.filter((m) => normalizeGrau(m.grau) === "Mestre" && m.presenca >= 50),
    [membros]
  );

  const handleExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

      const parsed: Membro[] = json
        .map((row) => ({
          id: makeId(),
          nome: inferNomeFromRow(row),
          grau: inferGrauFromRow(row),
          presenca: parseNumber(row["Presença (%)"] || row.presenca || row["presença"] || row["%"] || 0)
        }))
        .filter((m) => m.nome);

      setMembros(parsed);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleOCR = async (file: File) => {
    setLoading(true);
    try {
      const result = await Tesseract.recognize(file, "por");
      const text = result.data.text || "";
      setOcrText(text);

      const linhas = text.split("\n").map((l) => l.trim()).filter(Boolean);

      const parsed: Membro[] = linhas
        .map((linha) => {
          const grau = normalizeGrau(linha);
          const presencaMatch = linha.match(/(\d+[\.,]?\d*)\s*%?/);
          const presenca = presencaMatch ? parseNumber(presencaMatch[1]) : 0;
          const nome = linha
            .replace(/\b(Aprendiz|Companheiro|Mestre)\b/gi, "")
            .replace(/\b\d+[\.,]?\d*\s*%?\b/g, "")
            .replace(/\s{2,}/g, " ")
            .trim();

          if (!nome) return null;
          return { id: makeId(), nome, grau, presenca };
        })
        .filter(Boolean) as Membro[];

      if (parsed.length > 0) setMembros(parsed);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) handleExcel(file);
    else handleOCR(file);
  };

  const handleSaveMembro = () => {
    if (!form.nome.trim()) return;
    const novo: Membro = {
      id: editingId || makeId(),
      nome: form.nome.trim(),
      grau: normalizeGrau(form.grau),
      presenca: Number(form.presenca)
    };

    if (editingId) setMembros((prev) => prev.map((m) => (m.id === editingId ? novo : m)));
    else setMembros((prev) => [...prev, novo]);

    setForm(INITIAL_FORM);
    setEditingId(null);
  };

  const handleEdit = (m: Membro) => {
    setEditingId(m.id);
    setForm({ nome: m.nome, grau: normalizeGrau(m.grau) as Grau, presenca: m.presenca });
  };

  const handleDelete = (id: string) => {
    setMembros((prev) => prev.filter((m) => m.id !== id));
    setSelecoes((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((cargo) => {
        if (next[cargo] === id) delete next[cargo];
      });
      return next;
    });
    setComissoes((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((c) => {
        next[c] = next[c].filter((membroId) => membroId !== id);
      });
      return next;
    });
  };

  const elegiveisPorCargo = (cargo: string) => {
    const selecionadoAtual = selecoes[cargo] || "";
    const idsEmOutrosCargos = Object.entries(selecoes)
      .filter(([outroCargo, membroId]) => outroCargo !== cargo && Boolean(membroId))
      .map(([, membroId]) => membroId);

    return membros
      .filter((m) => isCargoElegivel(m, cargo))
      .filter((m) => !idsEmOutrosCargos.includes(m.id) || m.id === selecionadoAtual)
      .sort((a, b) => b.presenca - a.presenca);
  };

  const handleSelectCargo = (cargo: string, membroId: string) => {
    setSelecoes((prev) => {
      const next = { ...prev };
      if (!membroId) delete next[cargo];
      else next[cargo] = membroId;
      return next;
    });
  };

  const comissaoPermitida = (comissao: string, membroId: string) => {
    const membro = membros.find((m) => m.id === membroId);
    if (!membro) return false;
    if (normalizeGrau(membro.grau) !== "Mestre") return false;
    if (membro.presenca < 50) return false;

    const cargoDoMembro = Object.entries(selecoes).find(([, id]) => id === membroId)?.[0];
    if (cargoDoMembro === "Venerável Mestre") return false;
    if (comissao === "Assuntos Gerais" && cargoDoMembro === "Orador") return false;
    if ((comissao === "Finanças" || comissao === "Solidariedade") && (cargoDoMembro === "Tesoureiro" || cargoDoMembro === "Hospitaleiro")) return false;
    return true;
  };

  const elegiveisComissao = (comissao: string) => {
    const idsEmOutrasComissoes = Object.entries(comissoes)
      .filter(([outraComissao]) => outraComissao !== comissao)
      .flatMap(([, ids]) => ids);

    return membros
      .filter((m) => !(comissoes[comissao] || []).includes(m.id))
      .filter((m) => !idsEmOutrasComissoes.includes(m.id))
      .filter((m) => comissaoPermitida(comissao, m.id))
      .sort((a, b) => b.presenca - a.presenca);
  };

  const vagasComissao = (comissao: string) => {
    const disponiveis = membros.filter((m) => comissaoPermitida(comissao, m.id));
    return disponiveis.length >= 3 ? 3 : 2;
  };

  const toggleComissao = (comissao: string, membroId: string) => {
    const limite = vagasComissao(comissao);
    setComissoes((prev) => {
      const atuais = prev[comissao] || [];
      const emOutraComissao = Object.entries(prev)
        .filter(([outra]) => outra !== comissao)
        .some(([, ids]) => ids.includes(membroId));

      if (atuais.includes(membroId)) {
        return { ...prev, [comissao]: atuais.filter((id) => id !== membroId) };
      }
      if (emOutraComissao) return prev;
      if (atuais.length >= limite) return prev;
      return { ...prev, [comissao]: [...atuais, membroId] };
    });
  };

  const preencherComissoesAutomaticamente = () => {
    const novos: Record<string, string[]> = {
      "Assuntos Gerais": [],
      Finanças: [],
      Solidariedade: []
    };

    const usados = new Set<string>();

    const escolherParaComissao = (comissao: string) => {
      const disponiveis = membros
        .filter((m) => !usados.has(m.id))
        .filter((m) => comissaoPermitida(comissao, m.id));

      const limiteBase = disponiveis.length >= 3 ? 3 : 2;

      const candidatos = disponiveis
        .sort((a, b) => b.presenca - a.presenca)
        .slice(0, limiteBase);

      novos[comissao] = candidatos.map((m) => m.id);
      candidatos.forEach((m) => usados.add(m.id));
    };

    escolherParaComissao("Assuntos Gerais");
    escolherParaComissao("Finanças");
    escolherParaComissao("Solidariedade");

    setComissoes(novos);
  };

  const gerarPDF = () => {
    const doc = new jsPDF();
    const hoje = new Date().toLocaleDateString("pt-BR");
    let y = 15;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Resumo Final - Gestão de Cargos e Comissões", 10, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Data de geração: ${hoje}`, 10, y);

    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Cargos", 10, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    CARGOS.forEach((cargo) => {
      const nome = membros.find((m) => m.id === selecoes[cargo])?.nome || "—";
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(`${cargo}: ${nome}`, 10, y);
      y += 7;
    });

    y += 6;
    if (y > 280) {
      doc.addPage();
      y = 15;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Comissões", 10, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    COMISSOES.forEach((comissao) => {
      const nomes = (comissoes[comissao] || [])
        .map((id) => membros.find((m) => m.id === id)?.nome)
        .filter(Boolean)
        .join(", ") || "—";

      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(`${comissao}: ${nomes}`, 10, y);
      y += 7;
    });

    doc.save("resumo-final-loja-maconica.pdf");
  };

  const alertas = useMemo(() => {
    const items: { texto: string; tipo: "ok" | "warn" | "error" }[] = [];
    const totalMestres50 = mestresElegiveis.length;

    if (totalMestres50 < CARGOS.length) {
      items.push({
        texto: `Há apenas ${totalMestres50} Mestres com presença mínima para ${CARGOS.length} cargos. Alguns cargos podem ficar vagos.`,
        tipo: "warn"
      });
    } else {
      items.push({
        texto: "Há Mestres suficientes para preencher todos os cargos exclusivamente com Mestres elegíveis.",
        tipo: "ok"
      });
    }

    CARGOS.forEach((cargo) => {
      const membroId = selecoes[cargo];
      if (!membroId) return;
      const membro = membros.find((m) => m.id === membroId);
      if (!membro) return;
      if (!isCargoElegivel(membro, cargo)) {
        items.push({ texto: `${membro.nome} não atende aos critérios do cargo ${cargo}.`, tipo: "error" });
      }
    });

    COMISSOES.forEach((comissao) => {
      const qtd = (comissoes[comissao] || []).length;
      const limite = vagasComissao(comissao);
      if (qtd > 0 && qtd < limite) {
        items.push({ texto: `${comissao} ainda está incompleta: ${qtd}/${limite}.`, tipo: "warn" });
      }
    });

    return items;
  }, [membros, selecoes, comissoes, mestresElegiveis]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-start">
      <img
        src={logoLoja}
        alt="Logo da Loja"
        className="w-20 h-20 object-contain"
      />
    </div>

    <div className="text-center">
      <h1 className="text-xl md:text-3xl font-bold leading-tight">
        AUG∴ RESP∴ LOJ∴ SIMB∴ PHOENIX DO LESTE - Nº 451
      </h1>
    </div>

    <div />
  </div>

  <p className="text-sm text-slate-600 mt-4 text-center">
    Sistema de gestão de cargos e comissões
  </p>
</div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-3xl shadow-sm border p-6 space-y-4">
            <h2 className="text-xl font-semibold">Importação e cadastro</h2>
            <input type="file" onChange={handleFile} className="block w-full text-sm" />
            {loading && <p className="text-sm text-amber-700">Processando OCR...</p>}

            <div className="grid gap-3">
              <input
                className="border rounded-2xl px-3 py-2"
                placeholder="Nome"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              />
              <select
                className="border rounded-2xl px-3 py-2"
                value={form.grau}
                onChange={(e) => setForm((prev) => ({ ...prev, grau: e.target.value as Grau }))}
              >
                <option value="Mestre">Mestre</option>
                <option value="Companheiro">Companheiro</option>
                <option value="Aprendiz">Aprendiz</option>
              </select>
              <input
                className="border rounded-2xl px-3 py-2"
                type="number"
                min={0}
                max={100}
                placeholder="Presença (%)"
                value={form.presenca}
                onChange={(e) => setForm((prev) => ({ ...prev, presenca: Number(e.target.value) }))}
              />
              <button className="rounded-2xl bg-slate-900 text-white px-4 py-2" onClick={handleSaveMembro}>
                {editingId ? "Salvar edição" : "Adicionar irmão"}
              </button>
            </div>

            {ocrText && (
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer font-medium">Ver texto bruto do OCR</summary>
                <pre className="mt-2 whitespace-pre-wrap bg-slate-100 p-3 rounded-2xl">{ocrText}</pre>
              </details>
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold mb-4">Irmãos cadastrados</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2">Nome</th>
                    <th className="py-2">Grau</th>
                    <th className="py-2">Presença</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {membros.map((m) => {
                    const grauNormalizado = normalizeGrau(m.grau);
                    const elegivel = grauNormalizado === "Mestre" && m.presenca >= 50;
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2">{m.nome}</td>
                        <td className="py-2">{grauNormalizado || "Não informado"}</td>
                        <td className="py-2">{m.presenca}%</td>
                        <td className="py-2">
                          <span className={`inline-flex border rounded-full px-2 py-1 text-xs ${badgeClass(grauNormalizado ? (elegivel ? "ok" : "warn") : "error")}`}>
                            {grauNormalizado ? (elegivel ? "Mestre elegível" : "Fora dos cargos/comissões") : "Grau não identificado"}
                          </span>
                        </td>
                        <td className="py-2 flex gap-2">
                          <button className="text-sm underline" onClick={() => handleEdit(m)}>Editar</button>
                          <button className="text-sm underline text-red-700" onClick={() => handleDelete(m.id)}>Excluir</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold mb-4">Cargos</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {CARGOS.map((cargo) => {
                const elegiveis = elegiveisPorCargo(cargo);
                const selecionado = selecoes[cargo] || "";
                return (
                  <div key={cargo} className="border rounded-2xl p-4 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{cargo}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full border ${badgeClass(PRESENCA_MINIMA[cargo] >= 75 ? "ok" : "warn")}`}>
                        mínimo {PRESENCA_MINIMA[cargo]}%
                      </span>
                    </div>
                    <select
                      className="w-full border rounded-2xl px-3 py-2 bg-white"
                      value={selecionado}
                      onChange={(e) => handleSelectCargo(cargo, e.target.value)}
                    >
                      <option value="">Selecione um Mestre</option>
                      {elegiveis.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} ({m.presenca}%)
                        </option>
                      ))}
                    </select>
                    {elegiveis.length === 0 && <p className="text-xs text-red-700 mt-2">Sem Mestre elegível disponível para este cargo.</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold mb-4">Alertas</h2>
            <div className="space-y-3">
              {alertas.map((alerta, idx) => (
                <div key={idx} className={`border rounded-2xl px-3 py-2 text-sm ${badgeClass(alerta.tipo)}`}>
                  {alerta.texto}
                </div>
              ))}
              {alertas.length === 0 && <p className="text-sm text-slate-500">Sem alertas no momento.</p>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-semibold">Comissões</h2>
              <p className="text-sm text-slate-600">Preenchimento automático respeitando incompatibilidades e disponibilidade.</p>
            </div>
            <button
              className="rounded-2xl bg-slate-900 text-white px-4 py-2"
              onClick={preencherComissoesAutomaticamente}
            >
              Preencher comissões automaticamente
            </button>
          </div>
        </div>

        <div className="grid xl:grid-cols-3 gap-6">
          {COMISSOES.map((comissao) => {
            const membrosAtuais = comissoes[comissao] || [];
            const limite = vagasComissao(comissao);
            const elegiveis = elegiveisComissao(comissao);
            return (
              <div key={comissao} className="bg-white rounded-3xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{comissao}</h2>
                  <span className={`text-xs px-2 py-1 rounded-full border ${badgeClass(membrosAtuais.length === limite ? "ok" : "warn")}`}>
                    {membrosAtuais.length}/{limite}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  {membrosAtuais.map((membroId) => {
                    const membro = membros.find((m) => m.id === membroId);
                    if (!membro) return null;
                    return (
                      <button
                        key={membroId}
                        className="w-full text-left rounded-2xl px-3 py-2 bg-slate-900 text-white"
                        onClick={() => toggleComissao(comissao, membroId)}
                      >
                        {membro.nome} — remover
                      </button>
                    );
                  })}
                  {membrosAtuais.length === 0 && <p className="text-sm text-slate-500">Nenhum membro selecionado.</p>}
                </div>

                <div className="space-y-2">
                  {elegiveis.map((m) => (
                    <button
                      key={m.id}
                      className="w-full text-left rounded-2xl px-3 py-2 border bg-slate-50 hover:bg-slate-100 disabled:opacity-50"
                      disabled={membrosAtuais.length >= limite}
                      onClick={() => toggleComissao(comissao, m.id)}
                    >
                      {m.nome} ({m.presenca}%)
                    </button>
                  ))}
                  {elegiveis.length === 0 && <p className="text-sm text-slate-500">Sem Mestres disponíveis para esta comissão.</p>}
                </div>

                <div className="mt-4 text-xs text-slate-600 space-y-1">
                  <p>• Usa 3 membros; cai para 2 quando não houver nomes suficientes.</p>
                  <p>• Um irmão pode ter cargo e comissão.</p>
                  <p>• Um irmão não pode participar de mais de uma comissão.</p>
                  {comissao === "Assuntos Gerais" && <p>• Orador não pode integrar esta comissão.</p>}
                  {(comissao === "Finanças" || comissao === "Solidariedade") && <p>• Tesoureiro e Hospitaleiro não podem integrar esta comissão.</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-3xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">Resumo final</h2>
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-semibold mb-2">Cargos preenchidos</h3>
              <ul className="space-y-1">
                {CARGOS.map((cargo) => (
                  <li key={cargo}>
                    <span className="font-medium">{cargo}:</span> {membros.find((m) => m.id === selecoes[cargo])?.nome || "—"}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Comissões</h3>
              <ul className="space-y-2">
                {COMISSOES.map((comissao) => (
                  <li key={comissao}>
                    <span className="font-medium">{comissao}:</span> {(comissoes[comissao] || []).map((id) => membros.find((m) => m.id === id)?.nome).filter(Boolean).join(", ") || "—"}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6">
            <button
              className="rounded-2xl bg-green-700 text-white px-6 py-3 hover:bg-green-800"
              onClick={gerarPDF}
            >
              Gerar PDF do resumo final
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
