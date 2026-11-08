# JeanWake — registro público dos avanços

## 2026-11-08 — 0.3.1-dev (instalado; português a configurar)

- Novo modo pt-BR integrado à tela e ao serviço Android, em paralelo à opção antiga, sem compartilhar a captura do microfone.
- Criada `PortugueseSetupActivity` para importar o modelo personalizado Android `.ppn` e salvar a AccessKey com Android Keystore via `PtBrSettings`.
- Modelo oficial português `porcupine_params_pt.pv` incorporado ao APK, SHA-256 `21bee74582f81ce6f43d5580ee604bd358e24c71381f15d5af719c6f0beb0ed8`.
- Após detecção pt-BR (ainda não testada), código libera microfone e tenta abrir o deep link do ChatGPT. Isso **não garante** conversa iniciada.
- Build `assembleDebug` reportou `BUILD SUCCESSFUL`; APK debug SHA-256 `9AA56EFC34C982AC9542DB0EAE020CF104488E807D8D126E1B83052BE37543`.
- **ADB `install -r`: Success**; Android confirmou a versão `0.3.1-dev` (`versionCode=4`) no Redmi Note 13. O GPTWake original continua instalado.
- Código reproduzível publicado em `changes.patch` junto às classes adicionais; `git apply --check` verificado.
- **Pendências:** AccessKey, modelo `.ppn`, reconhecimento da frase real, confirmação de voz do ChatGPT e bateria.

## 2026-11-08 — 0.2.0-dev (testes reais)

- Integração inicial com Porcupine Android 4.0.2, compilada como módulo não conectado.
- APK experimental instalado manualmente no Android após bloqueio ADB do HyperOS.
- Teste com tela apagada: `mWakefulness=Dozing`, serviço foreground ativo, áudio não silenciado, `droppedFrames=0` durante janela observada.
- CPU da antiga detecção offline observado em torno de 53% de um núcleo durante o teste: otimizar.

## 2026-11-08 — 0.1.0-dev (base)

- Separação do applicationId `br.com.jeanborba.jeanwake` da aplicação GPTWake original.
- Notebook preparado com Java 21, Gradle 9.6.1 e Android SDK 37.
- Primeiro build Android concluído; `LaunchDiagnostics` para checagem das restrições de atividades exportadas no ChatGPT.
- Identificada restrição `AssistantActivity not exported` e falha na confirmação do deep link ao modo de voz.
