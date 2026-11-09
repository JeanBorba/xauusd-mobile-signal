# JeanWake — assistente de voz Android (protótipo aberto)

Objetivo: permitir que o usuário diga **“Ei, ChatGPT”** em português brasileiro, inclusive com a tela bloqueada, no Redmi Note 13 com Android 15/HyperOS 2.

**Estado em 08/11/2026: versão `0.4.1-dev` compilada e instalada via ADB no aparelho.** Esta versão oferece uma opção **“Ativar português sem conta (Vosk)”**, que elimina a exigência de cadastro ou AccessKey do Picovoice. **Reconhecimento real da frase Vosk ainda não validado no celular**; a conversa de voz oficial do ChatGPT pode não iniciar, porque o Android bloqueia a atividade interna que era usada no GPTWake.

## O que está implementado

- Aplicativo separado do GPTWake original, identificador Android `br.com.jeanborba.jeanwake`.
- Serviço de captura de microfone foreground, com botão **Stop** e funcionamento em tela bloqueada comprovado anteriormente com o mecanismo original.
- Dois motores opcionais para português: **Vosk offline pt-BR** (sem conta) e **Porcupine** (requer AccessKey e modelo personalizado).
- Modelo **Vosk small Portuguese 0.3** oficial, licenciado sob Apache-2.0, 31 MB compactados, incluído no APK; extrai aproximadamente 53 MB em armazenamento privado do app ao ativar. SHA-256 do ZIP: `6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7`.
- Bibliotecas Android Vosk `0.3.75` e JNA `5.18.1`.
- Reconhecimento Vosk configurado para tratar a frase como **transcrição contínua**. Pode ser menos confiável e gastar mais bateria que um detector exclusivo de palavra-chave. O texto ouvido **não é gravado em logs**.
- Opção Picovoice permanece disponível; uma AccessKey é protegida pelo Android Keystore, nunca incluída no APK.
- Apenas **um motor** utiliza o microfone de cada vez.
- Após detectar a frase, o aplicativo libera o microfone e tenta abrir um deep link do ChatGPT, **sem confirmação de que o modo de voz realmente abriu**.

## Diagnóstico da versão 0.4.1-dev

O primeiro teste com voz real não produziu o evento de ativação, embora o Vosk estivesse ouvindo. Em uma **amostra de voz sintetizada** em português brasileiro, o reconhecedor transcreveu “Ei, ChatGPT” como “chat z peter”. Por isso, o comparador da v0.4.1 aceita variantes fonéticas específicas e inclui diagnósticos de atividade de fala **sem salvar transcrições**. Foram aprovados 14 testes do comparador; o resultado com a voz real do usuário ainda precisa ser verificado.

**APK de desenvolvimento instalado:** `0.4.1-dev`, versionCode `6`; SHA-256 `58025D955C2E953F89843D8A8F41B1978CC03C9D033603E3FFC495D1ED519209`.

## Status e próximos testes

1. Abra **JeanWake (Dev) → Configurar Ei, ChatGPT → Ativar português sem conta (Vosk)**. Esse primeiro preparo extrai o modelo local e pode demorar alguns instantes.
2. Quando a interface indicar **Português sem conta: ATIVADO**, volte à tela principal e toque em **Start**.
3. Diga **“Ei, ChatGPT”** e observe se o aplicativo detectou a fala. Testar primeiro desbloqueado e depois bloqueado.
4. Examinar ADB para `JEANWAKE_VOSK_ENGINE_READY`, `JEANWAKE_VOSK_PT_WAKE_DETECTED` e falhas de captura, sem divulgar transcrições de áudio.
5. Medir bateria, falsos positivos e falhas de reinício. Interromper com **Stop** após testes.
6. Resolver a integração com uma sessão de voz oficial ou projetar assistente independente via API oficial com cobrança e credenciais próprias.

**Ainda não é uma versão final de uso diário.** Não exigir root, desabilitar proteções do Android ou publicar senhas/chaves.

## Fonte e reprodução

Código original baseado no [GPTWake](https://github.com/suddenBook/GPTWake) commit `2e31652be39b1751a6a75eac3027716b7d5286b1`. O [patch](changes.patch) deste repositório passou em `git apply --check` contra essa base; classes adicionais em [src/](src/) devem ser copiadas para `app/src/main/java/com/desmond/gptwake/` nas respectivas pastas.

O ZIP público do modelo offline pode ser obtido de [Vosk oficial](https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip) e copiado para `app/src/main/assets/vosk/vosk-model-small-pt-0.3.zip` antes do build. O modelo pt-BR Picovoice `.pv` é obtido de [seu upstream](https://github.com/Picovoice/porcupine/tree/master/lib/common).

Use **JDK 21, Gradle 9.6.1 e Android SDK 37**, e execute `gradle :app:assembleDebug`. Os fontes foram publicados; o APK permanece no notebook do proprietário, não é uma release de produção.

## Privacidade e licença

GPTWake e Vosk são distribuídos sob Apache-2.0, respeitando avisos e atribuição ao código-base; o Picovoice possui termos próprios. O reconhecimento offline Vosk não precisa enviar áudio a servidor. Não publicar credenciais, dados de log pessoais ou arquivos privados.

[Histórico](CHANGELOG.md) · [Desenvolvimento / issue #3](https://github.com/JeanBorba/xauusd-mobile-signal/issues/3).
