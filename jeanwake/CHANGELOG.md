# JeanWake — avanços e limitações

## 2026-11-08 — 0.5.0-dev: teste da rota pública ACTION_ASSIST

- Identificada por ADB a atividade `com.openai.feature.assistant.impl.AssistantProxyActivity` como destino exportado de `android.intent.action.ASSIST` no pacote oficial `com.openai.chatgpt`.
- Integração no JeanWake pelo método `GptLauncher.launchPublicAssist()`. O código não usa permissões privilegiadas ou a atividade interna `AssistantActivity` para o novo fluxo.
- Botão de teste manual disponibilizado na configuração: **“Testar abertura do assistente ChatGPT”**. O usuário precisa parar a escuta antes do teste.
- Nova preferência de abertura após detecção **desligada por padrão**, habilitada apenas por ação explícita do usuário devido aos falsos positivos já demonstrados da frase curta.
- Registrado um teste ADB de `ACTION_ASSIST`: `am start` retornou `Status: ok` e nome da atividade `AssistantProxyActivity`, mas **sem nova captura do microfone do ChatGPT** e sem sessão de voz confirmada.
- O aparelho negou a injeção de `KEYCODE_BACK` por permissão `INJECT_EVENTS`; não é necessária para o JeanWake e não será contornada.
- `BUILD SUCCESSFUL` para 0.5.0-dev. APK SHA-256: `DA4F837A574DC4E0832E8E0ED3A2CC274338F1EB75F939945AD9F43147F2C0AC`.
- `adb install -r`: **Success**, versão Android `0.5.0-dev` (versionCode 8). GPTWake original preservado.
- **Pendente:** validação do botão dentro do aplicativo com a escuta parada, teste bloqueado somente se houver sucesso, observabilidade de áudio e redução de falsos positivos.

## 2026-11-08 — 0.4.2-dev: frase curta “Ei, GPT” em modo de teste

- Usuário pediu a frase de ativação **“Ei, GPT”** no lugar de “Ei, ChatGPT”.
- Teste no notebook com fala sintetizada pt-BR: o Vosk transcreve “Ei, GPT” como `peter` ou `z peter`; a gramática restrita produziu `[unk] ei z peter` em exemplos positivos. Um exemplo negativo (“Eu gostei do GPT”) também foi reconhecido como `ei z peter`, revelando **risco real de falsos positivos**.
- Implementado vocabulário restrito no Vosk e `WakePhraseMatcher.java` atualizado; **20 testes unitários de correspondência passaram**. Isso não comprova reconhecimento confiável com a voz do usuário.
- Implementado `VoskDebugState.java` e cartão de diagnóstico local *opt-in*; texto reconhecido só é exibido em memória por 30 segundos e não é registrado em logcat nem publicado.
- **Modo experimental seguro:** uma detecção do Vosk produz apenas evento e reinicia a escuta; **a abertura automática do ChatGPT está desabilitada** até avaliar acertos e falsos positivos.
- Gradle: `BUILD SUCCESSFUL`; APK SHA-256 `D422A1EE3573CBC1EADE5C396DA748A7D7A0D478AEA8C9D6A651492BE7534BC4`; Android versionCode `7`.
- ADB `install -r` retornou `Success`, versão instalada confirmada como `0.4.2-dev`; GPTWake original preservado.
- Publicados fontes atualizados, patch reproduzível e testes na branch `jeanwake-development`.
- **Pendente:** teste com voz real e bloqueio de tela, verificação de falsos positivos e confirmação de integração com voz oficial do ChatGPT.

## 2026-11-08 — v0.4.1-dev (correção de transcrição e diagnóstico)

- Após o teste real do usuário, o ADB mostrou serviço Vosk em foreground e microfone ativo, mas **nenhum evento de reconhecimento de palavra de ativação** até 21:05 (hora local). O aplicativo não tentou abrir o ChatGPT.
- Diagnóstico reproduzido no notebook com voz sintética pt-BR de `Microsoft Maria Desktop`: o Vosk reconheceu `Ei, ChatGPT!` como `chat z peter`; outras amostras produziram `charge z peter`, `oi chat z peter` e `chat de peter`. **Este resultado não é uma transcrição da voz do usuário.**
- O comparador antigo exigia `ei`, `chat` e `gpt` explicitamente, descartando essas saídas do modelo pequeno.
- Novo comparador `WakePhraseMatcher.java` aceita essas variantes específicas, mas rejeita falas comuns como `oi chat vamos conversar`; **14 testes locais passaram**.
- Diagnóstico agora registra apenas um marcador temporal de atividade de fala, sem guardar texto reconhecido, gravação ou transcrição do usuário.
- Gradle: **BUILD SUCCESSFUL**. SHA-256 do APK debug: `58025D955C2E953F89843D8A8F41B1978CC03C9D033603E3FFC495D1ED519209`.
- Atualização ADB: **Success**, pacote Android confirmado como `0.4.1-dev` (`versionCode=6`), preservando o GPTWake original.
- **Pendente:** testar novamente com a voz real do usuário e verificar `JEANWAKE_VOSK_PT_WAKE_DETECTED`; o deep link que tenta iniciar a conversa do ChatGPT continua sem garantia de funcionar com tela bloqueada.

## 2026-11-08 — v0.4.0-dev (Vosk pt-BR sem conta)

- Identificada exigência de e-mail corporativo no cadastro Picovoice do usuário; alternativa sem cadastro criada.
- Integrado modelo de português brasileiro `vosk-model-small-pt-0.3` (31 MB compactados, 53 MB extraídos), licenciado sob Apache-2.0. SHA-256 do ZIP: `6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7`.
- Testado carregamento do modelo com Vosk Python no notebook: `VOSK_MODEL_LOAD_OK`.
- Implementado `VoskPtBrAssets.java` para verificar o ZIP e extrair com proteção contra Zip Slip e limite de tamanho, e `VoskPtBrWakeDetector.java` para reconhecimento/transcrição local sem logs da fala.
- Adicionada opção **Ativar português sem conta (Vosk)** à tela de configuração; motor original/Porcupine e Vosk selecionados de forma exclusiva, sem disputar o microfone.
- Compilação Gradle retornou **BUILD SUCCESSFUL**; APK SHA-256: `10735D83D9E7298C296A0768E65DF35B6390262344DE3A4B5F5AF8DC246D5459`.
- Atualização instalada por ADB (`install -r` retornou `Success`, Android confirmou `versionName=0.4.0-dev`, `versionCode=5`). GPTWake original preservado.
- **Pendente:** preparar o modelo no Android, testar o serviço Vosk com tela bloqueada, avaliar CPU/bateria e confirmar se o texto detectado consegue abrir conversa de voz. Pode haver falsas ativações e falhas ao transcrever o nome ChatGPT.

## 2026-11-08 — v0.3.1-dev (Picovoice opcional)

- Tela de configuração em português com armazenamento criptografado de AccessKey e importação de palavra personalizada Android `.ppn`.
- Modelo de idioma `.pv` pt-BR verificado e embutido.
- Build e instalação ADB confirmados.

## 2026-11-08 — v0.2.0-dev (validação de tela bloqueada)

- Serviço da captura original manteve microfone ativo com Android em `Dozing` sem silenciamento durante o teste ADB.
- Medido consumo de CPU relativamente alto com motor antigo; uso contínuo ainda necessita otimização.

## 2026-11-08 — v0.1.0-dev

- Projeto separado de GPTWake com applicationId próprio.
- Ambiente Java/Android e primeira compilação funcional.
- Identificada restrição Android `AssistantActivity not exported` no ChatGPT.
