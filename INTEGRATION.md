# Integração: consumindo a API de cálculo a partir de outro serviço/agente

Guia para um **agente ou API externa** ler os diagnósticos de bateria já calculados.
A API de cálculo roda na Raspberry Pi, percorre as fazendas em ciclo e grava um
snapshot JSON em cache. O consumidor **só lê** — nunca recalcula, nunca toca no
volume do Docker. Toda consulta é uma **requisição HTTP**.

```
Seu agente  --HTTP GET-->  API de cálculo (:3100)  --lê-->  cache (volume Docker)
```

---

## 1. Conexão

- **Base URL:** `http://<IP-da-Pi>:3100`
- **Formato:** JSON em todas as respostas.
- **Só leitura:** os `GET` deste guia nunca disparam cálculo. Para forçar um
  recálculo existe `POST` (seção 6), mas o normal é o ciclo automático (~60 min).

### Autenticação

Se `API_PASSWORD` estiver definido na Pi, **toda** rota exige HTTP Basic Auth.
Envie o header em cada request:

```
Authorization: Basic base64("<API_USER>:<API_PASSWORD>")
```

`API_USER` default é `admin`. Com `API_PASSWORD` vazio (dev local), a auth fica
desligada e o header é opcional.

---

## 2. Endpoints (leitura)

| Método | Rota | Retorna |
| --- | --- | --- |
| GET | `/diagnostics/status` | Estado do loop + resumo por fazenda×período (leve, sem `raw`). Bom para descoberta e health-check. |
| GET | `/diagnostics/farms` | Fazendas configuradas + `slug` (usado nas rotas) + quais períodos têm cache. |
| GET | `/diagnostics/farms/:farm/periods/:period` | Arquivo completo do período: todos os dispositivos com `health`, `stats`, `legacy` e `raw`. |
| GET | `/diagnostics/farms/:farm/periods/:period/devices/:addr` | Um único dispositivo. |

- `:farm` → **slug** (ex.: `entre-rios`) ou o nome exato da fazenda.
- `:period` → **apenas** `3h`, `3d` ou `7d`. Qualquer outro valor retorna `400`.
- `:addr` → aceita `1`, `01` ou `001` (inteiro 0–999).

Descubra os slugs válidos em `GET /diagnostics/farms` antes de montar as rotas.

---

## 3. Fluxo recomendado para o agente

1. **Descoberta:** `GET /diagnostics/farms` → lista de `{ name, slug, periods }`.
   Itere sobre `slug` e sobre os períodos que interessam.
2. **Leitura:** `GET /diagnostics/farms/<slug>/periods/<period>`.
3. **Frescor:** cheque o campo `stale` (veja seção 5). Se `true`, o snapshot tem
   mais de 24h — decida se usa mesmo assim ou espera o próximo ciclo.
4. **Filtragem:** itere `devices` e filtre por `health.diagnosis`, `health.lifeStatus`
   e principalmente `health.flags` (seção 4).

Não precisa paginar: cada arquivo de período traz todos os dispositivos da fazenda.

---

## 4. Campos para filtrar (o que olhar em cada dispositivo)

Cada entrada em `devices` é indexada pelo ADDR com 3 dígitos (`"001"`, `"032"`).
Campos mais úteis para triagem:

| Campo | Uso no filtro |
| --- | --- |
| `status` | `"ready"` ou `"failed"` (tabela de log ausente). Descarte `failed`. |
| `modelType` | `SOLAR` / `FONTE` / `UNKNOWN`. |
| `health.lifeStatus` | `OK` / `ATENCAO` / `CRITICO` — severidade principal. |
| `health.diagnosis` | Um valor: `NORMAL`, `BATERIA_FRACA`, `FALHA_CARGA`, `DESCARGA_EXCESSIVA`, `BAIXA_TENSAO_RECENTE`, `DADOS_INSUFICIENTES`. |
| `health.confidence` | `BAIXA` / `MEDIA` / `ALTA` — confie mais em `MEDIA`+ e janela `7d`. |
| `health.flags` | **Array de tags ortogonais** — um device pode ter várias. |

### `health.flags` e `health.signals`

`flags` é um array (`[]` quando nada dispara). São sinais **independentes** do
`diagnosis` — um dispositivo com `diagnosis: NORMAL` pode ter `BROWNOUT`.

- `BROWNOUT` — a placa reiniciou ≥2× na janela (quedas de `uptime`). Pega falha de
  alimentação que a amostragem esparsa de tensão não registra. Evidência em
  `signals.brownout = { resets, detected }`.
- `CARGA_DEGRADANDO` — o pico de carga diário vem caindo (≤ −0.1 V/dia em ≥3 dias
  válidos). Tendência de vida útil. Evidência em
  `signals.chargeTrend = { slopePerDay, days, declining }`.

> Nota: `BROWNOUT` conta reinícios do dispositivo; nem todo reinício é falta de
> energia (pode ser firmware/watchdog). Trate como sinal a investigar, não veredito.

---

## 5. Frescor e erros

- **`stale`** (booleano) vem em cada resposta de leitura. `true` = snapshot > 24h.
  O dado ainda é servido; cabe ao consumidor decidir.
- **`404`** — sem cache para aquela fazenda/período (ainda não rodou). A mensagem
  sugere o `POST` de disparo. Trate como "sem dado ainda", não como erro fatal.
- **`400`** — período ou ADDR inválido.
- **`409`** — só nos `POST`: já há execução em andamento.
- **`401`** — Basic Auth ausente/errada.

Sempre cheque o status HTTP antes de parsear o corpo.

---

## 6. Disparo manual (opcional)

O normal é deixar o ciclo automático (~60 min) alimentar o cache. Se o agente
precisar de dado fresco sob demanda:

| Método | Rota | Efeito |
| --- | --- | --- |
| POST | `/diagnostics/farms/:farm/run` | Recalcula os 3 períodos de **uma** fazenda. `409` se já estiver rodando. |
| POST | `/diagnostics/run-all` | Ciclo completo (todas as fazendas, em sequência). `409` se um ciclo já estiver em andamento. |

Esses `POST` são **caros** (abrem túnel SSH + MySQL por fazenda). Evite chamar em
loop; prefira ler o cache e só disparar quando `stale` for `true`.

---

## 7. Exemplos

### Node.js (fetch nativo, Node 18+)

```js
const BASE = "http://<IP-da-Pi>:3100";
const auth = "Basic " + Buffer.from("admin:SUA_SENHA").toString("base64");

async function getPeriod(slug, period) {
  const res = await fetch(`${BASE}/diagnostics/farms/${slug}/periods/${period}`, {
    headers: { Authorization: auth },
  });
  if (res.status === 404) return null;          // sem cache ainda
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Ex.: todos os dispositivos com brownout em entre-rios (7d)
const file = await getPeriod("entre-rios", "7d");
if (file && !file.stale) {
  const brownout = Object.values(file.devices).filter(
    (d) => d.status === "ready" && d.health.flags.includes("BROWNOUT"),
  );
  console.log(`${brownout.length} device(s) com BROWNOUT`);
}
```

### curl

```bash
curl -u admin:SUA_SENHA \
  http://<IP-da-Pi>:3100/diagnostics/farms/entre-rios/periods/7d
```

### PowerShell

```powershell
$cred = Get-Credential   # usuário admin, senha = API_PASSWORD
$r = Invoke-RestMethod -Credential $cred `
  http://<IP-da-Pi>:3100/diagnostics/farms/entre-rios/periods/7d

# dispositivos CRÍTICOS ou com qualquer flag
$r.devices.PSObject.Properties.Value |
  Where-Object { $_.health.lifeStatus -eq 'CRITICO' -or $_.health.flags.Count -gt 0 }
```

---

## 8. Formato da resposta (recortado)

```json
{
  "farm": "entre rios",
  "period": "7d",
  "generatedAt": "2026-07-10T16:49:22.134Z",
  "windowStart": "2026-07-03T16:00:00.000Z",
  "windowEnd": "2026-07-10T16:00:00.000Z",
  "stale": false,
  "devices": {
    "015": {
      "addr": 15,
      "model": "DIR-PS",
      "modelType": "SOLAR",
      "status": "ready",
      "health": {
        "healthScore": 97.8,
        "lifeStatus": "ATENCAO",
        "diagnosis": "NORMAL",
        "confidence": "ALTA",
        "validDays": 7,
        "flags": ["BROWNOUT"],
        "signals": {
          "brownout": { "resets": 3, "detected": true },
          "chargeTrend": { "slopePerDay": 0.12, "days": 7, "declining": false }
        }
      },
      "stats": { "totalRows": 0, "validBatteryRows": 0, "minBat": null },
      "legacy": {},
      "raw": []
    }
  },
  "summary": { "totalDevices": 42, "readyDevices": 42, "failedDevices": 0, "totalRows": 26011 }
}
```

`raw[]` traz o log bruto completo de `LOG_DEV` (pode ser grande). Se o agente só
precisa do diagnóstico, ignore `raw` e leia `health`/`stats`.
