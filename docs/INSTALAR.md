# Guia de instalação da FlyNotes

Este guia explica, passo a passo, como ter a sua própria FlyNotes a funcionar e como a instalar no computador e no telemóvel. Não é preciso saber programar.

**Índice**

1. [Escolher a forma de instalar](#1-escolher-a-forma-de-instalar)
2. [Opção A — Na nuvem (computador e telemóvel)](#2-opção-a--na-nuvem-computador-e-telemóvel)
3. [Opção B — Só no computador](#3-opção-b--só-no-computador)
4. [Instalar como aplicação no telemóvel](#4-instalar-como-aplicação-no-telemóvel)
5. [Instalar como aplicação no computador](#5-instalar-como-aplicação-no-computador)
6. [Primeiros passos](#6-primeiros-passos)
7. [Web Clipper (Chrome e Edge)](#7-web-clipper-chrome-e-edge)
8. [Opcional: notificações e lembretes ao minuto](#8-opcional-notificações-e-lembretes-ao-minuto)
9. [Atualizar para uma versão nova](#9-atualizar-para-uma-versão-nova)
10. [Cópias de segurança](#10-cópias-de-segurança)
11. [Resolução de problemas](#11-resolução-de-problemas)

---

## 1. Escolher a forma de instalar

A FlyNotes é para **uma pessoa**: cada utilizador cria a sua própria instalação, com os seus dados.

- **Opção A — Na nuvem.** A aplicação fica num endereço na internet só seu. Funciona no computador e no telemóvel, em qualquer lugar, e pode ser instalada como app. É gratuita dentro dos planos gratuitos da Vercel (alojamento) e da Neon (base de dados), que chegam largamente para uso pessoal. **É a opção recomendada.**
- **Opção B — Só no computador.** A aplicação corre no seu PC ou Mac e os dados ficam numa pasta desse computador. Serve para experimentar ou para quem não quer nada na internet. O telemóvel só consegue aceder quando está na mesma rede Wi-Fi e o computador está ligado, e sem as funções de app (instalação, offline, notificações).

Pode começar pela opção B e passar mais tarde para a A: exporte as notas (menu **Ficheiro → Exportar todas as notas (.enex)**) e importe-as na nova instalação.

---

## 2. Opção A — Na nuvem (computador e telemóvel)

### O que precisa
- Uma conta no [GitHub](https://github.com/signup) (gratuita).
- Uma conta na [Vercel](https://vercel.com/signup) — pode entrar com a conta do GitHub.

### Passos

1. **Abra a ligação de instalação:**
   [![Instalar na Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdiogobsfsilva-glitch%2Fflynotes&project-name=flynotes&repository-name=flynotes&env=FLYNOTES_PASSWORD%2CSESSION_SECRET&envDescription=FLYNOTES_PASSWORD%3A%20a%20password%20para%20entrar%20na%20aplica%C3%A7%C3%A3o.%20SESSION_SECRET%3A%20um%20texto%20aleat%C3%B3rio%20longo%20%2840%20ou%20mais%20caracteres%29.&envLink=https%3A%2F%2Fgithub.com%2Fdiogobsfsilva-glitch%2Fflynotes%2Fblob%2Fmain%2Fdocs%2FINSTALAR.md&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D)

2. **Crie o repositório.** A Vercel propõe copiar a FlyNotes para a sua conta do GitHub. Deixe o nome `flynotes` e clique em **Create**. Pode deixar o repositório privado.

3. **Adicione o armazenamento.** Aparecem dois pedidos; aceite ambos com as opções predefinidas e o plano gratuito:
   - **Neon** — a base de dados onde ficam as notas;
   - **Blob** — onde ficam os anexos (deixe o acesso em *Private*).

4. **Preencha as variáveis:**
   - `FLYNOTES_PASSWORD` — a password para entrar. Use pelo menos 10 caracteres.
   - `SESSION_SECRET` — um texto aleatório com 40 ou mais caracteres. Não precisa de o decorar; pode escrever ao acaso.

5. Clique em **Deploy** e aguarde cerca de um minuto.

6. No fim, a Vercel mostra o endereço da sua FlyNotes (por exemplo `https://flynotes-abc123.vercel.app`). **Guarde-o nos favoritos.** Abra-o e entre com a password.

> **Se a página de entrada disser que falta a base de dados ou a password:** veja a [resolução de problemas](#11-resolução-de-problemas).

---

## 3. Opção B — Só no computador

### O que precisa
- [Node.js](https://nodejs.org) versão 22 ou superior. No site, descarregue a versão **LTS** e instale com as opções predefinidas.

### Windows

1. Nesta página do GitHub, clique no botão verde **Code** → **Download ZIP**.
2. Na pasta **Transferências**, clique com o botão direito no ficheiro → **Extrair tudo**.
3. Mova a pasta extraída para um sítio definitivo, por exemplo **Documentos**.
4. Abra a pasta e faça duplo clique em **`iniciar.bat`**.
   - Se o Windows mostrar "O Windows protegeu o seu PC", clique em **Mais informações** → **Executar mesmo assim**.
5. Abre-se uma janela preta. Na primeira vez a instalação demora alguns minutos. Quando terminar, o navegador abre em `http://localhost:5173`.
6. A janela preta mostra a linha **"Foi criada uma password para si"**. Use-a para entrar.

### Mac

1. Descarregue o ZIP como acima e faça duplo clique para extrair. Mova a pasta para **Documentos**.
2. Faça duplo clique em **`iniciar.command`**.
   - Se o macOS disser que o ficheiro não pode ser aberto: clique com o botão direito → **Abrir** → **Abrir**. Se continuar a recusar, abra a app **Terminal**, escreva `chmod +x ` (com o espaço), arraste o ficheiro para a janela e carregue em Enter; depois repita o duplo clique.
3. O resto é igual ao Windows.

### Usar no dia a dia

- A FlyNotes só funciona enquanto essa janela estiver aberta. Para a voltar a usar, faça de novo duplo clique no ficheiro `iniciar`.
- A password está no ficheiro `.env` dentro da pasta (é um ficheiro oculto). Pode mudá-la na aplicação, em **Definições → Password**.
- **As suas notas estão na pasta `.data`.** Não a apague, e inclua-a nas suas cópias de segurança.
- No telemóvel, ligado ao mesmo Wi-Fi, abra o endereço que a janela mostra em "Na mesma rede Wi-Fi" (por exemplo `http://192.168.1.20:5173`).

---

## 4. Instalar como aplicação no telemóvel

*Requer a opção A (endereço `https://`).*

### iPhone e iPad
1. Abra o endereço da sua FlyNotes no **Safari** (tem de ser o Safari).
2. Toque no botão **Partilhar** (o quadrado com a seta para cima).
3. Escolha **Adicionar ao ecrã principal** → **Adicionar**.
4. Abra a FlyNotes pelo novo ícone e entre com a password.

### Android
1. Abra o endereço no **Chrome**.
2. Toque nos três pontos **⋮** → **Instalar aplicação** (ou **Adicionar ao ecrã principal**).
3. Abra a FlyNotes pelo novo ícone.

### Entrar sem password no telemóvel
Depois de entrar, vá a **Mais → Definições → Entrar com Face ID / impressão digital** e registe o dispositivo. A partir daí entra com o rosto ou o dedo.

### Guardar a partir de outras aplicações
No Android, depois de instalada, a FlyNotes aparece no menu **Partilhar** de outras apps (ligações e texto). No iPhone, copie a ligação e use **+ → Recortar web**.

---

## 5. Instalar como aplicação no computador

Opcional, mas dá-lhe a FlyNotes numa janela própria, com ícone no ambiente de trabalho.

- **Chrome / Edge (Windows e Mac):** abra o endereço, clique no ícone de instalar na barra de endereço (um ecrã com uma seta) → **Instalar**. Ou menu **⋮ → Transmitir, guardar e partilhar → Instalar página como aplicação**.
- **Safari (Mac):** menu **Ficheiro → Adicionar à Dock**.

---

## 6. Primeiros passos

- **Criar uma nota:** botão verde **+ Nota** (no telemóvel, o **+** ao centro).
- **Organizar:** crie cadernos em **Cadernos → Nova stack / novo caderno**; arraste notas para um caderno ou para o Lixo. No telemóvel, faça um toque prolongado na nota e arraste-a até ao destino.
- **Importar do Evernote:** no Evernote, clique com o botão direito num caderno → **Exportar** → formato `.enex`. Na FlyNotes: **Ficheiro → Importar notas do Evernote (.enex)**.
- **Mudar as cores:** **Definições → Aspeto**.
- **Atalhos úteis:** `Ctrl+Alt+N` nova nota · `Ctrl+K` pesquisar · `Ctrl+P` ir para qualquer nota ou comando.

---

## 7. Web Clipper (Chrome e Edge)

Um botão no navegador para guardar páginas nas suas notas.

1. Na FlyNotes, abra **Definições → Web Clipper** e clique em **Descarregar a extensão**. Extraia o ZIP para uma pasta definitiva.
2. No navegador, abra `chrome://extensions` (no Edge: `edge://extensions`), ligue o **Modo de programador** e clique em **Carregar expandida** (ou *Load unpacked*). Escolha a pasta extraída — a que contém o ficheiro `manifest.json`.
3. De volta às Definições da FlyNotes, clique em **Gerar código de ligação** e copie-o.
4. Clique no ícone da extensão, cole o código e escolha **Ligar**.

Para guardar uma página: clique no ícone (ou `Alt+Shift+F`), escolha **Artigo**, **Página**, **Seleção**, **Marcador** ou **Captura**, o caderno e as etiquetas.

---

## 8. Opcional: notificações e lembretes ao minuto

*Só na opção A.*

**Notificações com a aplicação fechada**
1. Num computador com Node.js, corra `npx web-push generate-vapid-keys`. Obtém uma chave pública e uma privada.
2. Na Vercel: o seu projeto → **Settings → Environment Variables**. Acrescente `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (com o valor `mailto:` seguido do seu email).
3. Em **Deployments**, abra o menu **⋯** da publicação mais recente → **Redeploy**.
4. Na FlyNotes de cada dispositivo: **Definições → Notificações → Ativar**. No iPhone, só funciona na app instalada no ecrã principal.

**Lembretes à hora exata**
O plano gratuito da Vercel só permite uma tarefa automática por dia (faz a cópia de segurança e envia o resumo da manhã). Para os lembretes chegarem ao minuto:
1. Acrescente a variável `CRON_SECRET` (um texto aleatório) e faça *Redeploy*.
2. Num serviço gratuito como o [cron-job.org](https://cron-job.org), crie uma tarefa que abra, de minuto a minuto, o endereço
   `https://O-SEU-ENDEREÇO/api/cron?job=tick&key=O-SEU-CRON_SECRET`.

---

## 9. Atualizar para uma versão nova

**Opção A (nuvem).** O botão de instalação cria no seu GitHub uma *cópia* do projeto, que não se atualiza sozinha. Para trazer uma versão nova, num computador com o [Git](https://git-scm.com) instalado:

```bash
git clone https://github.com/O-SEU-UTILIZADOR/flynotes.git
cd flynotes
git pull https://github.com/diogobsfsilva-glitch/flynotes.git main
git push
```

A Vercel publica a versão nova sozinha, cerca de um minuto depois do `git push`. Os seus dados não são afetados: estão na base de dados, não no código.

> **Quer atualizações com um clique?** Em vez do botão de instalação, faça **Fork** deste repositório no GitHub e importe o seu *fork* na Vercel (**Add New → Project**). Depois crie a base de dados e o armazenamento em **Storage** (Neon e Blob, privado), defina as duas variáveis e publique. Nessa modalidade, o GitHub mostra o botão **Sync fork → Update branch** sempre que houver novidades.

**Opção B (computador).** Descarregue o ZIP novo e extraia-o. Copie para a pasta nova a pasta **`.data`** e o ficheiro **`.env`** da instalação antiga. Depois faça duplo clique em `iniciar`.

Em ambos os casos, na aplicação já aberta recarregue a página **duas vezes** para passar a usar a versão nova.

---

## 10. Cópias de segurança

- **Opção A:** todos os dias de manhã é feita uma cópia automática das notas, cadernos, tarefas e eventos; ficam guardadas as 30 mais recentes. Veja e restaure em **Definições → Cópias de segurança**.
- **Opção B:** copie regularmente a pasta `.data` para outro disco.
- **Em qualquer caso:** **Ficheiro → Exportar todas as notas (.enex)** cria um ficheiro com tudo, incluindo anexos, que pode guardar onde quiser.

---

## 11. Resolução de problemas

**"Base de dados não configurada"** — Na Vercel, abra o projeto → **Storage** → **Create Database** → **Neon** → ligue-a ao projeto. Depois **Deployments → ⋯ → Redeploy**.

**"A instalação ainda não tem password"** — Em **Settings → Environment Variables**, acrescente `FLYNOTES_PASSWORD` e faça *Redeploy*.

**"Password incorreta" e sei que está certa** — Se mudou a password dentro da aplicação, a da variável `FLYNOTES_PASSWORD` deixou de valer. Após 5 erros o acesso fica bloqueado 15 minutos.

**Esqueci-me da password**
- *Opção A:* a password inicial está na Vercel, em **Settings → Environment Variables → `FLYNOTES_PASSWORD`**, onde a pode ver e alterar (faça *Redeploy* depois de alterar). Se a mudou dentro da aplicação, essa variável deixou de valer: abra o painel da Neon (a partir de **Storage**, na Vercel), entre no **SQL Editor** e corra `delete from app_meta where key = 'password_hash';`. A partir daí volta a valer a password da variável.
- *Opção B:* feche a janela da FlyNotes, abra um terminal na pasta da aplicação e corra `npm run reset-password`. O comando repõe a password do ficheiro `.env` e mostra-a. As notas não são alteradas.

**Os anexos não carregam (opção A)** — Falta o armazenamento Blob: **Storage → Create → Blob**, acesso *Private*, ligado ao projeto, e *Redeploy*.

**No iPhone não aparece "Adicionar ao ecrã principal"** — Só existe no Safari. Noutros navegadores, abra primeiro a página no Safari.

**A janela do `iniciar.bat` fecha logo** — O Node.js não está instalado ou é anterior à versão 22. Instale a versão LTS em [nodejs.org](https://nodejs.org) e tente de novo.

**Erro `EADDRINUSE` (porta 5173 em uso)** — Outra cópia da FlyNotes já está aberta. Feche a outra janela, ou acrescente a linha `PORT=5180` ao ficheiro `.env`.

**Não vejo as alterações depois de atualizar** — Recarregue duas vezes. Se usa a app instalada, feche-a por completo e volte a abrir.

Se encontrar um erro que não está aqui, abra um *issue* no GitHub com a descrição do que fez e a mensagem que apareceu.
