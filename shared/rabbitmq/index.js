const amqp = require('amqplib');

let connection = null;
let channel    = null;


const QUEUES = {
  FILE_UPLOADED: 'file.uploaded',
  FILE_SYNCED:   'file.synced',
  FILE_SHARED:   'file.shared',
};


const connect = async (retries = 5, delay = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(process.env.RABBITMQ_URL);
      channel    = await connection.createChannel();

     
      for (const queue of Object.values(QUEUES)) {
        await channel.assertQueue(queue, { durable: true });
      }

      connection.on('error', (err) => {
        console.error('[RabbitMQ] Connection error:', err.message);
      });

      connection.on('close', () => {
        console.warn('[RabbitMQ] Connection closed. reconnecting...');
        setTimeout(() => connect(retries, delay), delay);
      });

      console.log('[RabbitMQ] Connected');
      return channel;
    } catch (err) {
      console.warn(`[RabbitMQ] Attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('[RabbitMQ] Could not connect after all retries');
};


const publish = (queue, payload) => {
  if (!channel) throw new Error('[RabbitMQ] Not connected — call connect() first');
  channel.sendToQueue(
    queue,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
};


const consume = async (queue, handler) => {
  if (!channel) throw new Error('[RabbitMQ] Not connected — call connect() first');
  await channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(payload);
      channel.ack(msg);
    } catch (err) {
      console.error(`[RabbitMQ] Error processing message on "${queue}":`, err.message);

      channel.nack(msg, false, false);
    }
  });
};

module.exports = { connect, publish, consume, QUEUES };