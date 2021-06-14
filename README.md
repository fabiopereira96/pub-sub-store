# Exemplo de uma Aplicação Pub/Sub

O objetivo deste roteiro é apresentar uma pequena aplicação construída em uma arquitetura publish/subscribe, usando para isso a ferramenta RabbitMQ.

## Arquitetura orientada a eventos

Ao contrário de um modelo tradicional, no qual um cliente faz uma requisição para um serviço que processa e retorna uma mensagem sincronamente, em uma arquitetura orientada a eventos, temos uma estrutura desacoplada da informação, na qual uma ação, gera eventos que serão processados por aqueles que tiverem interesse nela.

Por exemplo, toda ação de comprar uma mercadoria gera um evento, que pode ser do interesse de vários outros serviços, como emissão de nota fiscal, envio da mercadoria e atualização do estoque. Ou seja, a partir de um evento de compra, várias ações independentes podem acontecer.

A seguir ilustramos a arquitetura do nosso sistema de exemplo. Nele, um pedido desencadeia o processamento do pagamento e, em seguida, ações como emissão de nota fiscal (invoice), entrega (delivery) e atualização de estoque (inventory) são executadas de maneiras independente.

Sendo assim, em uma arquitetura pub/sub temos dois tipos de sistemas (ou processos):

 * **Produtores**: processos que são responsáveis por gerar eventos.
 
 * **Consumidores**: processos que são assinantes de eventos, ou seja, eles maninfestam antecipadamente que querem ser notificados sempre que um determinado evento ocorrer. 

 ![fluxo_compra](./images/fluxo_compras_mensagem.png)
 
Nessa figura, de um lado temos as aplicações que são produtoras de eventos e do outro aquelas que consomem os eventos. Note que o serviço de pagamento é tanto consumidor do evento de compra, como produtor de eventos para os demais processps do sistema. 

<!---
## Modelo de pub/sub

 Há diversos modelos que implementam esta noção de arquitetura, neste tutorial iremos focar no modelo pub/sub, que trata-se de uma infraestrutura de mensageria baseada em subscrições em um fluxo de evento. Ou seja, quando um evento acontece ele é publicado e enviado a todos os serviços que estão inscritos nele. 
 
![pub_sub_image](https://d1.awsstatic.com/product-marketing/Messaging/sns_img_topic.e024462ec88e79ed63d690a2eed6e050e33fb36f.png)
--->

Uma ferramenta de fácil utilização que permite desenvolver aplicações pub/sub é o RabbitMQ, que utilizaremos neste roteiro. Essa ferramenta implementa e disponibiliza funções para publicar, assinar e receber eventos. Além disso, ela implementa internamente uma estrutura de dados que armazena os eventos do sistema.

 ## Sistema de Exemplo

Vamos agora dar um pouco mais de informações sobre o nosso sistema de exemplo. Basicamente, imagine que nós ficamos responsáveis por implementar o sistema de pós-venda de uma loja de discos de vinil. Na nossa implementação, a compra de um disco será o evento principal do sistema. Quando ele ocorrer, temos que verificar se o pedido é válido ou não. Se ele for válido, temos que:

 * Notificar o cliente de que o pedido dele foi aprovado
 * Notificar a equipe de transporte de que temos uma nova entrega para fazer. 

 Por outro lado, caso o pedido seja inválido iremos que:
 
  * Notificar o cliente de que faltou determinada informação no seu pedido.

Essas ações são independentes uma das outras. Ou seja, o cliente não deve ficar esperando o término de todo o processamento de seu pedido. Em vez disso, podemos informá-lo que o seu pedido está sendo processado e quando finalizarmos cada uma das etapas ele será notificado do progresso. 

Temos portanto a seguinte arquitetura mais detalhada:

![system_design](./images/system_design.png)

Borá colocá-lao em prática?  Primeiro, façca um fork deste projeto e siga os três passos a seguir:

## Passo 1: Instalando, Executando e Inicializando o RabbitMQ

Como dissemos antes, toda a lógica de pub/sub do nosso sistema será gerenciada pelo RabbitMQ. Ou seja, o armazenamento, publicação, assinatura e notificação de eventos será de responsabilidade desse sistema. Assim, não precisaremos nos preocupar com tais implementações.

Para facilitar o uso e execução do RabbitMQ,  este repositório inclui um container docker com esse sistema. Se você não possui o Docker instalado na sua máquina, veja como fazer isso no seguinte [link](https://www.docker.com/products/docker-desktop).

Após o downDoad, basta executar o docker e em seguida o comando abaixo, na pasta raiz do projeto:

```
docker-compose up -d q-rabbitmq
````

Após rodar esse comando, uma imagem do RabbitMQ estará executando localmente e será possível acessar sua interface gráfica, digitando no navegador: http://localhost:15672/. 

Por meio dessa interface gráfica, é possível monitorar as filas que estão sendo gerenciadas pelo RabbitMQ. Por exemplo, pode-se ver a quantidade de mensagens em cada fila e as aplicações que estão conectadas nelas.

No entanto, ainda não temos nenhuma fila. Vamos, portanto, criar uma, mesmo sem nenhum outro processo ainda estar rodando. 

Como ilustrado na próxima figura, vá até a guia `Queues`, na sessão `add a new queue`. Preencha os campos `name` como `orders` e clique na opção `lazy mode`. Essa opção fará com que a fila utilize mais o disco rígido do que a memória RAM, não prejudicando o desempenho dos demais processos que iremos criar nos próximos passos.

![create_queue](./images/create_queue.png)

Com a fila criada, podemos agora um evento representando um pedido, de acordo com o formato abaixo (substitua os campos com dados fictícios a sua escolha):

````json
{
    "name": "NOME_DO_CLIENTE",
    "email": "EMAIL_DO_CLIENTE",
    "cpf": "CPF_DO_CLIENTE",
    "creditCard": {
        "number": "NUMERO_DO_CARTAO_DE_CREDITO",
        "securityNumber": "CODIGO_DE_SEGURANCA"
    },
    "products": [
        {
            "name": "NOME_DO_PRODUTO",
            "value": "VALOR_DO_PRODUTO"
        }
    ],
    "address": {
        "zipCode": "CEP",
        "street": "NOME_DA_RUA",
        "number": "NUMERO_DA_RESIDENCIA",
        "neighborhood": "NOME_DO_BAIRO",
        "city": "NOME_DA CIDADE",
        "state": "NOME_DO_ESTADO"
    }
}
````

Com o JSON preenchido, clique na fila na qual deseja inserir a mensagem, que neste caso é `orders`

![select_queue](./images/select_queue.png)

Na sessão `Publish message`, copie o JSON no campo `Payload`. Em seguida, clique no botão `publish message`

![publish_message](./images/publish_message.png)

## Passo 2: Subindo os Serviços

### 1º Serviço: Processamento dos Pedidos

Até este momento, temos uma fila `orders`, com um evento do tipo pedido em espera para ser processado. Ou seja, está na hora de subir uma aplicação para consumi-lo.

Na pasta `service` deste repositório, já implementamos o serviço [orders](https://github.com/franneves/exemplo-de-uma-arquitetura-orientada-a-eventos/tree/34dda5e88c3df59065989a7593fd2d1dd0f8855d/services/order), cuja função é ler pedidos da fila de mesmo nome e verificar se eles são válidos ou não. Se p édido for válido, ele encaminha o pedido para as filas de contactar o cliente e de preparo de envio, como é possivel ver pela função que processa as mensagens recebidas:

``` JavaScript
async function processMessage(msg) {
    const orderData = JSON.parse(msg.content)
    try {
        if(isValidOrder(orderData)) {
            await (await RabbitMQService.getInstance()).send('contact', { 
                "clientFullName": orderData.name,
                "to": orderData.email,
                "subject": "Pedido Aprovado",
                "text": `${orderData.name}, seu pedido de disco de vinil acaba de ser aprovado, e esta sendo preparado para entrega!`,
            })
            await (await RabbitMQService.getInstance()).send('shipping', orderData)
            console.log(`✔ PEDIDO APROVADO`)
        } else {
            await (await RabbitMQService.getInstance()).send('contact', { 
                "clientFullName": orderData.name,
                "to": orderData.email,
                "subject": "Pedido Reprovado",
                "text": `${orderData.name}, seus dados não foram suficientes para realizar a compra :( por favor tente novamente!`,
            })
            console.log(`X PEDIDO REPROVADO`)
        }
    } catch (error) {
        console.log(`X ERROR TO PROCESS: ${error.response}`)
    }
}

```
Para inicializar o serviço, basta executar o seguinte comando na raiz do projeto:

```
docker-compose up -d --build order-service
````
Após executé-lo, pode-se acessar o log da aplicação por meio do seguinte comando:

````
 docker logs order-service
````

Após analisar o log, é possível ver que a mensagem que inserimos na fila do RabittMQ no passo anterior foi processada com sucesso. 

Isso ilustra uma das características da comunicação em filas: elas são tolerantes a falhas. Por exemplo, se um dos consumidores estiver fora do ar, a informação não se perde e é processada assim que ele ficar disponível novamente.

Outra coisa que vale a pena mencionar: ao acessar a aba Queues no RabbitMQ, vamos ver que existem duas novas filas:

![queues_final](./images/queues_final.png)

Essas novas filas, `shipping` e `contact`, serão usadas, respectivamente, para comunicação com dois novos serviços:

* Um serviço que solicita o envio da mercadoria
* Um serviço que contacta o cliente por email, informando se seu pedido foi aprovado ou não.

Ambos já foram implementados em nosso reposistório, conforme explicaremos a seguir.

### 2º Serviço: Envio de E-mail para o Cliente 

O serviço [contact](https://github.com/franneves/exemplo-de-uma-arquitetura-orientada-a-eventos/tree/master/services/contact) implementa uma lógica que contacta o cliente por e-mail, informando o status da sua compra.  Ele assina os eventos da fila `contact` e, para cada novo evento, envia um email para o cliente responsável pela compra. A função `processMessage(msg)` é responsável por isso:

```JavaScript
async function processMessage(msg) {
    const mailData = JSON.parse(msg.content)
    try {
        const transporter = await nodemailer.createTransport({
            host: "smtp.mailtrap.io",
            port: 2525,
            auth: {
                user: process.env.USER,
                pass: process.env.PASS
            }
        })

        const mailOptions = {
            'from': process.env.MAIL_USER,
            'to': `${mailData.clientFullName} <${mailData.to}>`,
            'cc': mailData.cc || null,
            'bcc': mailData.cco || null,
            'subject': mailData.subject,
            'text': mailData.text,
            'attachments': null
        }

        await transporter.sendMail(mailOptions)

        console.log(`✔ SUCCESS`)
    } catch (error) {
        console.log(`X ERROR TO PROCESS: ${error.response}`)
    }
}
```

Para testar o envio de e-mail, recomendamos usar um sistema chamado [mailtrap](https://mailtrap.io/). Para isso, basta criar uma [conta](https://mailtrap.io/register/signup?ref=header), fornecendo dados básicos do seu email e nome. Assim que você criar a conta, será redirecionado para a página principal, onde o campo `Show Credentials` estará encolhido, conforme a imagem abaixo:

![pagina_principal](./images/mailtrap-credentials.jpg)

Para configurar o seu projeto, basta expandir `Show Credentials` e copiar o Username e Password no arquivo [./services/contact/.env](https://github.com/franneves/exemplo-de-uma-arquitetura-orientada-a-eventos/blob/master/services/contact/.env), conforme exemplo abaixo:

```js
USER  = "a361840f92fg31"
PASS  = "a16cb6f3d35b70"
```
Após essa configuração, os emails enviados pelo nosso sistema serão encaminhados para sua conta teste do mailtrap.  

Finalmente, chegou a hora de executar a aplicação, que assim como o serviço `orders`, pode ser inicializada via docker, por meio do seguinte comando (que deve ser chamado na raiz do projeto):

```
docker-compose up -d --build contact-service
````
 
Assim que o build finalizar, o serviço `contact-service` irá se conectar com RabbitMQ, consumirá a mensagem e notificará o cliente por email que sua compra foi processada, conforme mostrado na seguinte mensagem de log:

![log_email](./images/log_email.jpg)

Para visualizar esse log, basta executar:

````
 docker logs contact-service
````

Outra forma de verificar que a mensagem foi processada é acessando a caixa de entrada do mailtrap, conforme imagem abaixo:


![pedido_aprovado](./images/pedido_aprovado.jpg)

### 3º Serviço: Responsável por solicitar o envio de mercadoria

E agora temos que colocar o terceiro serviço no ar. Esse serviço encaminha o pedido para o departamento de despacho, que é responsável por enviar a encomenda chegue para a casa do cliente. Essa tarefa é de responsabilidade do serviço [shipping](https://github.com/franneves/exemplo-de-uma-arquitetura-orientada-a-eventos/tree/master/services/shipping), que conecta-se à fila `shipping` do RabbitMQ  e exibe o endereço da entrega.


```JavaScript
async function processMessage(msg) {
    const deliveryData = JSON.parse(msg.content)
    try {
        if(deliveryData.address && deliveryData.address.zipCode) {
            console.log(`✔ SUCCESS, SHIPPING AUTHORIZED, SEND TO:`)
            console.log(deliveryData.address)
        } else {
            console.log(`X ERROR, WE CAN'T SEND WITHOUT ZIPCODE :'(`)
        }

    } catch (error) {
        console.log(`X ERROR TO PROCESS: ${error.response}`)
    }
}
```

Para executar o serviço `shipping`, basta usar:

```
docker-compose up -d --build shipping-service
````

E, como fizemos com o seruiço anterior, para visualizar as informações exibidas pela aplicação, basta acessar o seu log:

````
 docker logs shipping-service
````

![shipping_message](./images/shipping_message.png)


Com isso, finalizamos e executamos todos os serviços do nosso sistema de exemplo construído em uma arquitetura pub/sub.

Mas sugerimos que você faça novos testes, para entender melhor os benefícios desse tipo de arquitetura. Por exemplo, você pode:

* subir e derrubar os serviços, em qualquer ordem, e testar se não há mesmo perda de mensagens
* publicar uma nova mensagem na fila e verificar se ela vai ser mesmo consumida por todos os serviços.

Para encerrar o container e finalizar as aplicações, basta executar: 

````
docker-compose down
````

### Passo 3:  Sua Vez: Colocando as mãos na massa

Ao terminar o projeto, sentimos falta de uma aplicação para gerar relatórios com os pedidos que foram feitos. Mas felizmente estamos usando uma arquitetura pub/sub e apenas precisamos "plugar" esse novo serviço de relatórios no sistema, o qual irá também consumir eventos publicados na fila `orders`. 

Seria possível nos ajudar e colocar em prática o que viu neste tutorial e construir uma aplicação que gere este relatório? 

Nós começamos a construí-la e vocês podem usar o nosso código como exemplo. Mas não precisa ficar limitado a ele, você pode consumir mensagens de diferentes formas e com outras linguagens de programação.  Por exemplo, existem tutoriais que explicam como consumir mensagens em Python, C# , Ruby e JavaScript neste [guia](https://www.rabbitmq.com/getstarted.html).

Qualquer dúvida, sintam-se à vontade para nos procurar: francielly.neves2@gmail.com

### Como continuar os estudos?

O que vimos aqui foi uma implementação de uma arquitetura orientada a eventos utilizando o modelo pub/sub, mas existem outros modelos, como por exemplo de transmissão de eventos. Mais detalhes sobre esta forma de arquitetura e outros modelos possíveis você pode encontrar [neste post da RedHat](https://www.redhat.com/pt-br/topics/integration/what-is-event-driven-architecture).

Para ser o meio que recebe e transmite as mensagens utilizamos o RabbitMQ, mas também há outras plataformas que poderíamos ter utilizado como por exemplo: [Apache Kafka](https://kafka.apache.org/intro) e [Redis](https://redis.io/topics/pubsub).

