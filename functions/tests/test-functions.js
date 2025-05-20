const axios = require('axios');
const { expect } = require('chai');

// 에뮬레이터 베이스 URL
const EMULATOR_BASE_URL = 'http://localhost:5001/db888-dev/us-central1';

/**
 * Firebase Functions 테스트 스크립트
 * 
 * 이 스크립트는 Firebase 에뮬레이터에서 실행 중인 함수를 테스트합니다.
 * 에뮬레이터는 명령어 `firebase emulators:start`로 시작해야 합니다.
 */
async function runTests() {
  console.log('Starting Firebase Functions tests...');

  try {
    // helloWorld 함수 테스트
    await testHelloWorld();
    
    // getUserInfo 함수 테스트
    await testGetUserInfo();
    
    // calculate 함수 테스트
    await testCalculate();
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  }
}

/**
 * helloWorld 함수 테스트
 */
async function testHelloWorld() {
  console.log('\nTesting helloWorld function...');
  
  // 기본 테스트
  const defaultResponse = await axios.get(`${EMULATOR_BASE_URL}/helloWorld`);
  console.log('  Default response:', defaultResponse.data);
  expect(defaultResponse.status).to.equal(200);
  expect(defaultResponse.data).to.have.property('message', 'Hello World!');
  expect(defaultResponse.data).to.have.property('timestamp');
  console.log('  ✓ Default response test passed');
  
  // 이름 파라미터 테스트
  const namedResponse = await axios.get(`${EMULATOR_BASE_URL}/helloWorld?name=Firebase`);
  console.log('  Named response:', namedResponse.data);
  expect(namedResponse.status).to.equal(200);
  expect(namedResponse.data).to.have.property('message', 'Hello Firebase!');
  console.log('  ✓ Named parameter test passed');
}

/**
 * getUserInfo 함수 테스트
 */
async function testGetUserInfo() {
  console.log('\nTesting getUserInfo function...');
  
  // 기본 테스트
  const defaultResponse = await axios.get(`${EMULATOR_BASE_URL}/getUserInfo`);
  console.log('  Default response:', defaultResponse.data);
  expect(defaultResponse.status).to.equal(200);
  expect(defaultResponse.data).to.have.property('userId', '123456');
  expect(defaultResponse.data).to.have.property('username', 'user_123456');
  expect(defaultResponse.data).to.have.property('email', 'user123456@example.com');
  console.log('  ✓ Default response test passed');
  
  // 사용자 ID 파라미터 테스트
  const customResponse = await axios.get(`${EMULATOR_BASE_URL}/getUserInfo?userId=789`);
  console.log('  Custom userId response:', customResponse.data);
  expect(customResponse.status).to.equal(200);
  expect(customResponse.data).to.have.property('userId', '789');
  expect(customResponse.data).to.have.property('username', 'user_789');
  expect(customResponse.data).to.have.property('email', 'user789@example.com');
  console.log('  ✓ Custom userId test passed');
}

/**
 * calculate 함수 테스트
 */
async function testCalculate() {
  console.log('\nTesting calculate function...');
  
  // 덧셈 테스트
  const addResponse = await axios.get(`${EMULATOR_BASE_URL}/calculate?operation=add&a=5&b=3`);
  console.log('  Addition response:', addResponse.data);
  expect(addResponse.status).to.equal(200);
  expect(addResponse.data).to.have.property('operation', 'add');
  expect(addResponse.data).to.have.property('result', 8);
  console.log('  ✓ Addition test passed');
  
  // 뺄셈 테스트
  const subtractResponse = await axios.get(`${EMULATOR_BASE_URL}/calculate?operation=subtract&a=10&b=4`);
  console.log('  Subtraction response:', subtractResponse.data);
  expect(subtractResponse.status).to.equal(200);
  expect(subtractResponse.data).to.have.property('operation', 'subtract');
  expect(subtractResponse.data).to.have.property('result', 6);
  console.log('  ✓ Subtraction test passed');
  
  // 곱셈 테스트
  const multiplyResponse = await axios.get(`${EMULATOR_BASE_URL}/calculate?operation=multiply&a=2&b=5`);
  console.log('  Multiplication response:', multiplyResponse.data);
  expect(multiplyResponse.status).to.equal(200);
  expect(multiplyResponse.data).to.have.property('operation', 'multiply');
  expect(multiplyResponse.data).to.have.property('result', 10);
  console.log('  ✓ Multiplication test passed');
  
  // 나눗셈 테스트
  const divideResponse = await axios.get(`${EMULATOR_BASE_URL}/calculate?operation=divide&a=20&b=4`);
  console.log('  Division response:', divideResponse.data);
  expect(divideResponse.status).to.equal(200);
  expect(divideResponse.data).to.have.property('operation', 'divide');
  expect(divideResponse.data).to.have.property('result', 5);
  console.log('  ✓ Division test passed');
  
  // 0으로 나누기 테스트
  try {
    const divideByZeroResponse = await axios.get(`${EMULATOR_BASE_URL}/calculate?operation=divide&a=10&b=0`);
    console.log('  Division by zero response:', divideByZeroResponse.data);
    expect(divideByZeroResponse.status).to.equal(400);
    expect(divideByZeroResponse.data).to.have.property('error', 'Cannot divide by zero');
    console.log('  ✓ Division by zero test passed');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('  ✓ Division by zero correctly returned error 400');
    } else {
      throw error;
    }
  }
  
  // 잘못된 연산 테스트
  try {
    const invalidOpResponse = await axios.get(`${EMULATOR_BASE_URL}/calculate?operation=power&a=2&b=3`);
    console.log('  Invalid operation response:', invalidOpResponse.data);
    expect(invalidOpResponse.status).to.equal(400);
    expect(invalidOpResponse.data).to.have.property('error');
    console.log('  ✓ Invalid operation test passed');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('  ✓ Invalid operation correctly returned error 400');
    } else {
      throw error;
    }
  }
}

// 테스트 실행
runTests();
