# JeanWake — avanços e limitações

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
