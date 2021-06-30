const RabbitMQService = require('./rabbitmq-service')
const path = require('path')

require('dotenv').config({ path: path.resolve(__dirname, '.env') })

var report = {}

async function updateReport(msg) {
    const msgContent = JSON.parse(msg.content);
    for(let product of msgContent.products) {
        if(!product.name) {
            continue
        } else if(!report[product.name]) {
            report[product.name] = {};
            report[product.name].qtd = 1;
            report[product.name].amountTotal = parseFloat(product.value);
        } else {
            report[product.name].qtd++;
            report[product.name].amountTotal += parseFloat(product.value);
        }
    }
    printReport();
}

async function printReport() {
    for (const [key, value] of Object.entries(report)) {
        console.log(`${key}:\n  Quantidade vendida: ${value.qtd}\n  Valor acumulado: R$ ${value.amountTotal}`);
      }
}

async function consume() {
    console.log(`INSCRITO COM SUCESSO NA FILA: ${process.env.RABBITMQ_QUEUE_NAME}`)
    await (await RabbitMQService.getInstance()).consume(process.env.RABBITMQ_QUEUE_NAME, (msg) => {updateReport(msg)})
}

consume();