# JeanWake — assistente de voz para Android (desenvolvimento)

Protótipo experimental de ativação por frase, inicialmente voltado ao **Redmi Note 13 / HyperOS 2**. Objetivo: detectar **"Ei, ChatGPT"** em português brasileiro com a tela apagada e iniciar uma conversa por voz de modo seguro e confiável.

> **Estado atual:** a primeira versão de desenvolvimento foi compilada localmente, mas **a ativação em português ainda não foi implementada** e **a abertura automática da voz do ChatGPT com a tela bloqueada não está resolvida**.

## Histórico / código-base

Este trabalho deriva de [suddenBook/GPTWake](https://github.com/suddenBook/GPTWake) (ver licença e atribuição no projeto original). O fork de desenvolvimento local usa o identificador Android `br.com.jeanborba.jeanwake` para não substituir o aplicativo original.

No notebook foram instalados JDK 21, Gradle 9.6.1 e Android SDK 37.0. O build de diagnóstico `0.1.0-dev` passou no Gradle. As modificações publicadas inicialmente nesta pasta representam o andamento e os módulos próprios, **não o código-fonte completo do APK**. Para acesso ao código-base, consulte o repositório original.

## Diagnóstico técnico verificado

- GPTWake pode iniciar o microfone e detectar uma frase.
- A atividade interna do ChatGPT `com.openai.voice.assistant.AssistantActivity` não está exportada na versão de Android testada; outra aplicação não pode iniciá-la por um `Intent` explícito.
- O fallback `https://chat.com/?mode=voice` não confirmou uma sessão de voz; abrir uma atividade não equivale a ativar o microfone.
- Atualizar o reconhecimento para português não resolve automaticamente a limitação de inicialização da voz.

## Plano de desenvolvimento

1. Reconhecimento local da frase em português via [Picovoice Porcupine](https://github.com/Picovoice/porcupine): requer modelo customizado `.ppn`, modelo português `.pv` e `AccessKey` privada. Nunca publicar chaves.
2. Configurações seguras, diagnósticos e interface para interromper a escuta.
3. Integração de voz via meios oficiais do Android e do ChatGPT quando disponíveis. Alternativa: assistente de voz independente usando API de áudio, com autorização e cobrança separadas.
4. Validação em dispositivo real, comportamento com tela bloqueada, consumo de bateria e permissões do HyperOS.

## Segurança e privacidade

Não publicar senhas, chaves, identificadores pessoais, arquivos de log detalhados, gravações do microfone ou backups do aparelho. Não exigir root nem expor ADB na internet. Usuários devem conceder as permissões necessárias e poder interromper a escuta a qualquer momento.

## Situação do repositório

Esta documentação foi publicada na branch pública `jeanwake-development` do repositório de trabalho do proprietário, provisoriamente, até haver um repositório dedicado. **Sem APK de produção ou release funcional neste momento.**

Veja [CHANGELOG](CHANGELOG.md) e [módulo de diagnóstico](LaunchDiagnostics.java).
