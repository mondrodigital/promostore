import { testEmailSetup } from './gmail';

async function runTests() {
  console.log('Starting Gmail API integration tests...');

  try {
    const result = await testEmailSetup();
    console.log('✅ Gmail API test passed:', result);
  } catch (error) {
    console.error('❌ Gmail API test failed:', error);
    throw error;
  }
}

runTests().catch(console.error);