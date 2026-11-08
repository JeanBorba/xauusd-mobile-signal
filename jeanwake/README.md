# JeanWake — assistente por voz para Android

Aplicativo experimental para o **Redmi Note 13 (HyperOS 2, Android 15)**, visando a palavra de ativação em português **"Ei, ChatGPT"** com tela bloqueada.

**Estado em 08/11/2026:** **JeanWake 0.3.1-dev compilado e instalado** no aparelho via ADB (`br.com.jeanborba.jeanwake`, versão 4). A escuta com tela apagada foi comprovada antes, na versão 0.2.0-dev. **O modo português ainda não foi validado em operação** porque precisa da AccessKey e de um modelo personalizado Android `.ppn`; a abertura automática da sessão de voz do ChatGPT continua sem confirmação.

## Implementado

- Serviço em primeiro plano para a captura de áudio, herdado do [GPTWake](https://github.com/suddenBook/GPTWake), preservando sua licença.
- Mecanismo **alternativo** de palavra-chave português com **Porcupine Android 4.0.2**, com escolha entre este e o reconhecedor antigo, **nunca simultâneos**.
- Tela dedicada para configurar português, selecionar `.ppn` e salvar uma **AccessKey Picovoice protegida pelo Android Keystore**. Não publicar a chave.
- Modelo público pt `porcupine_params_pt.pv` incluído no APK, verificado por SHA-256 contra o arquivo de origem oficial. O modelo é copiado para armazenamento privado ao abrir a configuração.
- Após detectar uma palavra em português, o código libera o microfone e **tenta** abrir o ChatGPT por deep link; é uma tentativa, **não uma abertura comprovada da conversa por voz**.
- Interface com acesso à configuração pt-BR e indicação do modo selecionado.
- Primeiro APK 0.3.1-dev assinado para depuração, compilado com sucesso e instalado no aparelho (assinatura debug). SHA-256 do APK local: `9AA56EFC34C982AC9542DB0EAE020CF104488E807D8D126E1B83052BE37543`.

## O que ainda falta

1. Obter uma AccessKey na conta do usuário em [Picovoice Console](https://console.picovoice.ai/), sem enviá-la pelo chat.
2. Criar e baixar um **modelo Android em português** da palavra "Ei, ChatGPT" em formato `.ppn` e importá-lo pelo JeanWake.
3. Validar que o motor Porcupine consegue capturar o microfone e reconhecer essa frase no aparelho com a tela apagada e sem USB.
4. Validar integração de voz: a `AssistantActivity` interna do ChatGPT **não é exportada** no teste; deep link não tem garantia de iniciar a sessão. Avaliar alternativa de assistente próprio via API autorizada, com custos diferentes da assinatura do ChatGPT.
5. Medir consumo de bateria e estabilizar o serviço antes da distribuição.

## Código-fonte reproduzível

O código-base é o commit GPTWake `2e31652be39b1751a6a75eac3027716b7d5286b1`. Os módulos abaixo são novos e o arquivo de diferenças aplica sobre esse commit:

- [Patch Git](changes.patch) — verificado com `git apply --check` contra o código-base
- [PtBrSettings.java](src/PtBrSettings.java)
- [PortugueseSetupActivity.java](src/PortugueseSetupActivity.java)
- [PtBrWakeDetector.java](src/PtBrWakeDetector.java)
- [LaunchDiagnostics.java](src/LaunchDiagnostics.java)
- [CHANGELOG](CHANGELOG.md)

Para reproduzir:

```bash
git clone https://github.com/suddenBook/GPTWake.git JeanWake-source
cd JeanWake-source
git checkout 2e31652be39b1751a6a75eac3027716b7d5286b1
curl -fL -o jeanwake-changes.patch https://raw.githubusercontent.com/JeanBorba/xauusd-mobile-signal/jeanwake-development/jeanwake/changes.patch
git apply --check jeanwake-changes.patch
git apply jeanwake-changes.patch
mkdir -p app/src/main/assets/picovoice
curl -fL -o app/src/main/assets/picovoice/porcupine_params_pt.pv https://raw.githubusercontent.com/Picovoice/porcupine/master/lib/common/porcupine_params_pt.pv
```

Copie as quatro classes Java indicadas acima de `jeanwake/src/` para `app/src/main/java/com/desmond/gptwake/`. Verifique o SHA-256 do modelo: `21bee74582f81ce6f43d5580ee604bd358e24c71381f15d5af719c6f0beb0ed8`. Compile com **Java 21**, **Gradle 9.6.1** e **Android SDK 37**, executando `gradle :app:assembleDebug`. Nunca embuta AccessKey pessoal ou modelos privados em APK público.

## Licença, privacidade e segurança

O código derivado do GPTWake permanece sujeito à sua [licença Apache 2.0](LICENSE) e atribuição ao projeto original. O SDK e os modelos Picovoice podem ter termos adicionais de uso/acesso. Modelos privados e chaves não são publicados. Não há root, desbloqueio de bootloader, gravação remota ou contorno de permissões Android.

Acompanhe o progresso na [issue #3](https://github.com/JeanBorba/xauusd-mobile-signal/issues/3). Os arquivos desta pasta são um *patch* reproduzível e módulos novos, **não uma release pronta para usuários finais**.
