# Datapool publica para consumo pela API de PDF via Tailscale Funnel

Data: 2026-07-10

## 1. Objetivo

Separar definitivamente as responsabilidades das duas APIs:

- a **API de calculo**, executada em uma Raspberry Pi, consulta os bancos
  remotos, calcula diagnosticos e mantem JSONs prontos em cache;
- a **API de PDF** solicita somente o JSON da fazenda e do periodo escolhidos,
  seleciona os campos necessarios e gera o PDF com Puppeteer;
- o acesso remoto acontece por HTTPS usando **Tailscale Funnel**, com um
  endereco gratuito e estavel no dominio `ts.net`;
- a porta interna da API de calculo nao fica exposta diretamente na internet.

O objetivo de desempenho e retirar SSH, MySQL e calculos do caminho da geracao
do PDF. A requisicao de PDF deve depender apenas da leitura do JSON pronto, da
montagem do HTML e do Puppeteer.

## 2. Escopo da primeira fase

Incluido:

- Raspberry Pi executando a API de calculo em Docker;
- cron/loop local atualizando os caches de todas as fazendas;
- JSONs de bateria nos periodos `3h`, `3d` e `7d`;
- gateway reverso local na Raspberry Pi;
- publicacao HTTPS pelo Tailscale Funnel;
- acesso global para a equipe de suporte;
- bloqueio externo dos endpoints que iniciam consultas;
- rate limit e logs no gateway;
- API de PDF consumindo o JSON por HTTP;
- preparacao do contrato para sensores e atuadores futuros.

Fora do escopo inicial:

- autenticacao dentro da API de calculo;
- credenciais individuais por cliente;
- autorizacao por fazenda;
- acesso publico para clientes finais;
- dominio proprio;
- persistencia historica de todos os caches;
- geracao de PDF dentro da Raspberry Pi;
- acesso direto da API de PDF ao volume Docker.

## 3. Arquitetura

```text
Equipe de suporte / API de PDF
              |
              | HTTPS
              v
https://<nome-da-pi>.<tailnet>.ts.net
              |
              v
       Tailscale Funnel
              |
              v
 Gateway local (Nginx)
   - permite somente GET de leitura
   - rate limit
   - limite de conexoes e payload
   - logs de acesso
              |
              | rede Docker privada
              v
 API de calculo (api-de-calculo:3100)
              |
              v
 Volume diagnostics-cache
              |
              +-- fazendas/<slug>/periodos/3h/log.json
              +-- fazendas/<slug>/periodos/3d/log.json
              +-- fazendas/<slug>/periodos/7d/log.json
```

### 3.1 Limites de responsabilidade

**API de calculo**

- descobre as fazendas e os dispositivos;
- abre os tuneis SSH;
- consulta `NEWSIR.CAD_DIR`, `CAD_MODEL_DIR` e `LOG_DEV.DEV###`;
- calcula diagnosticos por periodo;
- grava os JSONs de cache atomicamente;
- entrega os JSONs pelos endpoints de leitura;
- nunca gera PDF.

**Gateway local (Nginx)**

- e o unico servico publicado pelo Tailscale Funnel;
- filtra metodos e rotas permitidos;
- aplica limites de requisicao;
- registra acessos sem armazenar credenciais ou dados sensiveis;
- nao interpreta nem modifica o diagnostico.

**API de PDF**

- recebe a solicitacao de relatorio;
- valida fazenda, periodo e filtros do relatorio;
- pede o JSON pronto para a API de dados;
- rejeita cache ausente, invalido ou antigo conforme sua politica;
- seleciona somente os campos necessarios;
- renderiza HTML e gera PDF com Puppeteer;
- nao acessa SSH, MySQL ou o volume da Raspberry Pi;
- nao recalcula diagnosticos de bateria.

## 4. Publicacao com Tailscale Funnel

A Raspberry Pi deve executar o cliente Tailscale e ingressar em uma tailnet da
empresa. O nome do dispositivo sera `3v3-datapool-pi`:

```text
3v3-datapool-pi
```

O Funnel publica somente o gateway local. O sufixo real da tailnet e atribuido
pelo Tailscale durante a configuracao e deve ser registrado no inventario
operacional. A URL resultante segue o formato:

```text
https://3v3-datapool-pi.<tailnet>.ts.net
```

O HTTPS e encerrado pelo Tailscale. Nenhuma regra de port forwarding deve ser
criada no roteador da empresa.

Regras obrigatorias:

- nao publicar diretamente `3100`;
- API de calculo deve escutar apenas na rede interna necessaria;
- publicar somente a porta do gateway;
- executar Funnel em background como servico persistente;
- validar que o Funnel volta automaticamente depois de reboot da Pi;
- registrar a URL `ts.net` em configuracao da API de PDF, nunca hardcoded no
  codigo.

## 5. Gateway e superficie publica

### 5.1 Rotas permitidas externamente

```http
GET /diagnostics/farms
GET /diagnostics/status
GET /diagnostics/farms/:farm/periods/:period
GET /diagnostics/farms/:farm/periods/:period/devices/:addr
```

### 5.2 Rotas bloqueadas externamente

```http
POST /diagnostics/run-all
POST /diagnostics/farms/:farm/run
```

Qualquer metodo diferente de `GET` deve receber `405 Method Not Allowed` no
gateway publico. Rotas desconhecidas devem receber `404 Not Found`.

### 5.3 Limites iniciais sugeridos

Os valores precisam ser confirmados com teste de carga, mas a configuracao
inicial deve partir de:

- ate 30 requisicoes por minuto por IP para arquivos de periodo;
- rajada curta de ate 10 requisicoes;
- ate 120 requisicoes por minuto por IP para status e lista de fazendas;
- timeout de conexao com a API interna: 5 segundos;
- timeout de resposta para JSON grande: 60 segundos;
- limite de conexoes simultaneas adequado a memoria da Raspberry Pi;
- compressao gzip ou Brotli para JSON quando suportada pelo gateway;
- cabecalho `Cache-Control` curto para leituras, sem impedir a publicacao de um
  arquivo novo pelo cron.

O rate limit da API de PDF continua existindo de forma independente, porque a
geracao com Puppeteer e mais cara que a leitura de JSON.

## 6. Contrato de leitura da datapool

### 6.1 Descobrir fazendas

```http
GET /diagnostics/farms
```

A API de PDF usa o `slug` retornado como identificador nas proximas chamadas.
Ela nao deve fabricar o slug a partir do nome apresentado ao usuario.

### 6.2 Obter periodo completo

```http
GET /diagnostics/farms/{farmSlug}/periods/{period}
```

Valores aceitos inicialmente para `period`:

```text
3h
3d
7d
```

Exemplo:

```http
GET /diagnostics/farms/maringa-citrosuco/periods/3d
```

Resposta esperada:

- identificacao da fazenda;
- periodo;
- `generatedAt`, `windowStart` e `windowEnd`;
- mapa de dispositivos por ADDR;
- dados brutos do periodo;
- estatisticas;
- saude e diagnostico;
- resumo do arquivo.

### 6.3 Obter um dispositivo

```http
GET /diagnostics/farms/{farmSlug}/periods/{period}/devices/{addr}
```

Esse endpoint deve ser preferido quando o PDF solicitado representar um unico
dispositivo. Ele evita transferir o arquivo completo da fazenda.

### 6.4 Semantica de erros

- `400`: periodo ou ADDR invalido;
- `404`: fazenda, periodo ou dispositivo nao encontrado;
- `429`: limite do gateway excedido;
- `502`: gateway nao conseguiu acessar a API interna;
- `503`: API ou Raspberry Pi temporariamente indisponivel;
- `504`: tempo de resposta excedido.

A API de PDF deve transformar esses erros em mensagens operacionais e nao deve
gerar um PDF vazio como se fosse valido.

## 7. Fluxo de geracao de PDF

```text
Cliente solicita PDF
  -> API de PDF valida farmSlug, period e filtros
  -> API de PDF consulta a URL publica da datapool
  -> valida schema, generatedAt e windowEnd
  -> seleciona dispositivos e campos solicitados
  -> monta HTML
  -> Puppeteer gera PDF
  -> API de PDF devolve arquivo ou identificador do job
```

A API de PDF deve possuir as seguintes configuracoes:

```env
DATAPOOL_BASE_URL=https://3v3-datapool-pi.<tailnet>.ts.net
DATAPOOL_REQUEST_TIMEOUT_MS=60000
DATAPOOL_MAX_CACHE_AGE_MINUTES=180
```

O cliente HTTP deve usar conexoes persistentes, compressao e timeout. Uma
falha temporaria pode ter no maximo uma ou duas tentativas com pequeno backoff;
nao deve haver repeticao ilimitada.

O limite inicial de idade sera de 180 minutos para acomodar o ciclo sequencial
de fazendas. Depois de medir a duracao completa do cron, esse valor deve ser
reduzido ou aumentado de forma explicita, sempre permanecendo configuravel.

## 8. Desempenho esperado

A separacao elimina da requisicao de PDF:

- abertura de tunel SSH;
- consulta ao MySQL remoto;
- descoberta de dispositivos;
- leitura de sete dias de `LOG_DEV`;
- calculo dos diagnosticos.

O tempo final passa a ser composto por:

```text
download do JSON + filtro/montagem do HTML + Puppeteer
```

Nao se deve prometer geracao instantanea sem medicao. Arquivos `7d` com dados
brutos podem ser grandes e o Puppeteer ainda tem custo de inicializacao. Metas
iniciais a medir:

- leitura de um dispositivo: abaixo de 1 segundo na rede normal;
- leitura do periodo completo: medir por tamanho real e compressao;
- PDF apos JSON recebido: estabelecer baseline por modelo de relatorio;
- nenhuma consulta de banco causada por uma requisicao de PDF.

## 9. Disponibilidade e operacao na Raspberry Pi

Servicos que devem iniciar automaticamente:

- Docker;
- container da API de calculo;
- gateway;
- daemon do Tailscale;
- configuracao persistente do Funnel.

Verificacoes operacionais:

- espaco disponivel em disco;
- memoria e CPU da Pi;
- estado do container;
- ultimo ciclo do scheduler;
- idade do cache por fazenda e periodo;
- conectividade do Tailscale;
- resposta do gateway publico;
- crescimento dos logs.

Os logs devem possuir rotacao. O cache continua usando escrita atomica
`log.json.tmp` seguida de rename para impedir leitura parcial.

## 10. Seguranca da primeira fase

Mesmo sendo uma ferramenta interna de suporte, o endereco do Funnel e publico.
Portanto:

- nenhuma senha de banco, SSH ou conteudo do `.env` pode aparecer no JSON;
- endpoints de escrita e execucao ficam bloqueados;
- a porta `3100` nao pode ser publicada no host para redes nao confiaveis;
- o gateway aplica rate limit;
- logs registram horario, rota, status, duracao e IP observado;
- dados brutos devem ser revisados para impedir exposicao de campos sensiveis;
- a URL publica nao deve ser colocada em repositorio publico;
- atualizacoes de sistema, Docker, Tailscale e dependencias devem ser mantidas.

A ausencia de autenticacao e uma decisao temporaria de escopo, nao uma garantia
de seguranca. Antes de liberar para clientes finais, a fase de autenticacao e
autorizacao e obrigatoria.

## 11. Evolucao futura

### 11.1 Dominio proprio

Trocar a URL `ts.net` por algo como:

```text
https://dados.3v3suporte.com.br
```

A configuracao `DATAPOOL_BASE_URL` permite essa troca sem alterar o codigo da
API de PDF.

### 11.2 Autenticacao e autorizacao

Adicionar no gateway ou em um servico de acesso:

- chave ou token individual por cliente;
- expiracao e revogacao;
- rate limit por credencial;
- auditoria por cliente;
- lista de fazendas autorizadas;
- escopos como `battery:read`, `sensor:read` e `actuator:read`.

### 11.3 Novos dominios de dados

Evitar misturar tudo no endpoint de bateria. Usar contratos versionados:

```http
GET /v1/farms/:farm/battery/periods/:period
GET /v1/farms/:farm/sensors/:sensor/periods/:period
GET /v1/farms/:farm/actuators/:actuator/periods/:period
```

Cada dominio deve ter schema, cache, atualizacao e politica de retencao
proprios. A API de PDF escolhe o recurso necessario sem conhecer banco ou
estrutura de volume.

### 11.4 Reducao de payload

Se o JSON completo de `7d` ficar pesado, evoluir sem quebrar o contrato atual:

- endpoint `summary` sem dados brutos;
- selecao controlada de campos;
- paginacao ou intervalo temporal;
- endpoint de varios ADDRs selecionados;
- ETag e respostas condicionais;
- cache da API de PDF para requisicoes repetidas.

## 12. Testes e criterios de aceite

### 12.1 Rede e publicacao

- URL `ts.net` responde por HTTPS;
- reboot da Raspberry Pi restaura todos os servicos;
- nenhuma porta do banco ou SSH e publicada;
- acesso direto externo a `3100` falha;
- somente o gateway consegue acessar a API interna.

### 12.2 Gateway

- quatro rotas GET permitidas respondem corretamente;
- dois endpoints POST recebem bloqueio externo;
- metodos diferentes de GET sao rejeitados;
- rate limit retorna `429`;
- JSON grande e entregue completo e comprimido;
- falha da API interna retorna erro de gateway coerente.

### 12.3 API de PDF

- consulta fazenda e periodo selecionados;
- consulta um dispositivo sem baixar a fazenda inteira;
- rejeita periodo invalido;
- rejeita cache ausente ou velho conforme politica;
- nao chama banco, SSH ou endpoint de execucao;
- gera PDF usando fixture JSON e usando resposta real da datapool;
- timeout e indisponibilidade produzem erro claro;
- requisicoes repetidas respeitam o limite configurado.

### 12.4 Criterio funcional final

O desenho e considerado implantado quando uma maquina fora da rede da
Raspberry Pi consegue:

1. acessar a URL HTTPS `ts.net`;
2. listar fazendas;
3. solicitar `maringa-citrosuco/3d`;
4. receber o JSON de cache sem provocar nova consulta ao banco;
5. enviar esse JSON para a geracao do PDF;
6. obter o PDF com os dados selecionados;
7. confirmar pelos logs que nenhum endpoint de execucao foi chamado.

## 13. Sequencia de implementacao recomendada

1. Ajustar a exposicao Docker para manter a API de calculo interna.
2. Adicionar e configurar o gateway com allowlist de rotas GET.
3. Instalar e autenticar Tailscale na Raspberry Pi.
4. Nomear o dispositivo e habilitar o Funnel somente para o gateway.
5. Configurar inicializacao automatica e validar reboot.
6. Implementar o cliente da datapool na API de PDF.
7. Validar schema e idade do cache antes de renderizar.
8. Medir download, filtro, HTML e Puppeteer separadamente.
9. Executar testes externos e de bloqueio.
10. Documentar a URL e o procedimento operacional do suporte.
