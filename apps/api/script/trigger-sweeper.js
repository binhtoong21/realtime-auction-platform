import 'dotenv/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node trigger-sweeper.js <queueName> <jobName>');
  console.log('Available Sweepers (verify names in queue.js):');
  console.log('  - payment: grace-period-sweeper, payment-sweeper');
  console.log('  - webhook: webhook-reaper');
  console.log('  - fulfillment: fulfillment-sweeper');
  console.log('  - dispute: dispute-expiry-sweeper');
  console.log('Example: node trigger-sweeper.js dispute dispute-expiry-sweeper');
  process.exit(1);
}

const [queueName, jobName] = args;

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const queue = new Queue(queueName, { connection });

async function trigger() {
  try {
    // ⚠️ LƯU Ý: Script này truyền data là {} (rỗng)
    // Phù hợp cho đa số Sweeper/Reaper vì chúng tự query DB.
    // Nếu file *.worker.js của bạn check `job.data.someField` để chạy logic,
    // script này có thể fail hoặc no-op. Hãy kiểm tra logic xử lý trước khi chạy.
    const jobId = `manual-trigger-${Date.now()}`;
    await queue.add(jobName, {}, { jobId });
    console.log(`✅ Successfully triggered sweeper job '${jobName}' on queue '${queueName}'.`);
    console.log(`Job ID: ${jobId}`);
  } catch (error) {
    console.error('❌ Error triggering sweeper:', error);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

trigger();
