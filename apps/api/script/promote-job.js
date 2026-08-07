import 'dotenv/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node promote-job.js <queueName> <jobId>');
  console.log('       node promote-job.js <queueName> --list');
  console.log('       node promote-job.js --list-queues');
  console.log('Example: node promote-job.js payment grace_expiry_12345');
  console.log('Example: node promote-job.js payment --list');
  process.exit(1);
}

const queueNameOrCommand = args[0];
const jobId = args[1];

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

async function run() {
  try {
    if (queueNameOrCommand === '--list-queues') {
      const keys = await connection.keys('bull:*:id');
      console.log('\n=== Available BullMQ Queues in Redis ===');
      if (keys.length === 0) {
        console.log('No queues found.');
      } else {
        const queues = keys.map(k => k.split(':')[1]);
        queues.forEach(q => console.log(`- ${q}`));
      }
      return;
    }

    const queueName = queueNameOrCommand;
    const queue = new Queue(queueName, { connection });

    if (jobId === '--list') {
      const jobs = await queue.getJobs(['delayed']);
      console.log(`\n=== Delayed Jobs in Queue: '${queueName}' ===`);
      if (jobs.length === 0) {
        console.log('No delayed jobs found.');
      } else {
        jobs.forEach(j => {
          console.log(`- JobID: ${j.id} | Name: ${j.name}`);
          console.log(`  Data:`, j.data);
        });
      }
      await queue.close();
      return;
    }

    if (!jobId) {
      console.error('❌ Please provide a jobId or use --list');
      await queue.close();
      process.exit(1);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      console.error(`❌ Job with ID ${jobId} not found in queue ${queueName}.`);
      console.log(`Tip: Run "node promote-job.js ${queueName} --list" to see all delayed jobs and their exact IDs.`);
      await queue.close();
      process.exit(1);
    }

    const state = await job.getState();
    if (state !== 'delayed') {
      console.error(`❌ Job ${jobId} is in state '${state}'. Only 'delayed' jobs can be promoted.`);
      await queue.close();
      process.exit(1);
    }

    await job.promote();
    console.log(`✅ Successfully promoted job ${jobId}. It should run immediately.`);
    await queue.close();
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.quit();
  }
}

run();
