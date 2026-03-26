import { useState } from "react";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";

type Membro = {
nome: string;
grau: string;
presenca: number;
};

export default function App() {
const [membros, setMembros] = useState<Membro[]>([]);
const [selecoes, setSelecoes] = useState<Record<string, string>>({});
const [loading, setLoading] = useState(false);

const cargos = [
"Venerável Mestre",
"1º Vigilante",
"2º Vigilante",
"Orador",
"Tesoureiro",
"Secretário",
"Chanceler",
"Mestre de Cerimônias"
];

const handleExcel = (file: File) => {
const reader = new FileReader();
reader.onload = (evt) => {
const data = new Uint8Array(evt.target?.result as ArrayBuffer);
const workbook = XLSX.read(data, { type: "array" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const json: any[] = XLSX.utils.sheet_to_json(sheet);


  const parsed = json.map(row => ({
    nome: row.Nome || row.nome,
    grau: row.Grau || row.grau,
    presenca: Number(row["Presença (%)"] || row.presenca || 0)
  }));

  setMembros(parsed);
};
reader.readAsArrayBuffer(file);


};

const handleOCR = async (file: File) => {
setLoading(true);
const { data } = await Tesseract.recognize(file, "por");


const linhas = data.text.split("\n");

const parsed = linhas
  .map(l => {
    const partes = l.trim().split(" ");
    return {
      nome: partes[0],
      grau: partes[1],
      presenca: Number(partes[2]) || 0
    };
  })
  .filter(x => x.nome && x.grau);

setMembros(parsed);
setLoading(false);


};

const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
const file = e.target.files?.[0];
if (!file) return;


if (file.name.endsWith(".xlsx")) {
  handleExcel(file);
} else {
  handleOCR(file);
}


};

const selecionados = Object.values(selecoes);

const getElegiveis = (cargo: string) => {
let lista = membros.filter(m => !selecionados.includes(m.nome));


lista = lista.filter(m => {
  if (["Venerável Mestre", "1º Vigilante", "2º Vigilante"].includes(cargo)) {
    return m.presenca >= 75;
  }
  if (["Orador", "Tesoureiro"].includes(cargo)) {
    return m.presenca >= 50;
  }
  return m.presenca >= 50;
});

const mestres = lista.filter(m => m.grau === "Mestre");
if (mestres.length > 0) return mestres;

return lista;


};

const handleSelect = (cargo: string, nome: string) => {
setSelecoes(prev => ({ ...prev, [cargo]: nome }));
};

return (

  <div style={{ padding: 20 }}>
    <h1>Sistema de Cargos Maçônicos</h1>


<input type="file" onChange={handleFile} />
{loading && <p>Processando OCR...</p>}

<h2>Cargos</h2>
{cargos.map((cargo) => {
  const elegiveis = getElegiveis(cargo);

  return (
    <div key={cargo} style={{ marginBottom: 10 }}>
      <label>{cargo}</label>
      <select
        value={selecoes[cargo] || ""}
        onChange={(e) => handleSelect(cargo, e.target.value)}
      >
        <option value="">Selecione...</option>
        {elegiveis.map((m) => (
          <option key={m.nome} value={m.nome}>
            {m.nome} ({m.presenca}%) {m.grau !== "Mestre" ? "*" : ""}
          </option>
        ))}
      </select>
    </div>
  );
})}

<h2>Resultado</h2>
<pre>{JSON.stringify(selecoes, null, 2)}</pre>

<p>* indica não Mestre utilizado por falta de opção</p>


  </div>
);
}