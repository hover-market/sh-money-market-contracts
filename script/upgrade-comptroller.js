const { ethers } = require('hardhat');
const config = require('../../config');
const { Deployed, Accounts } = config;

async function main() {
  const signer = (await ethers.getSigners())[0];
  const networkConfig = network.name === 'mainnet' ? 'mainnet': 'testnet';
  
  console.log('Network:', network.name);
  console.log('Using Config:', networkConfig);
  console.log('Signer:', signer.address, '\n');
  
  const unitrollerAddress = Deployed.mainnet.Unitroller;
  const adminAddress = Accounts.mainnet.ComptrollerMultisig;

  console.log('Unitroller:', unitrollerAddress);

  const Comptroller = await ethers.getContractFactory('Comptroller');
  let comptroller = await Comptroller.deploy();
  await comptroller.deployed();
  console.log('Deployed comptroller', comptroller.address);
  
  const unitroller = await ethers.getContractAt('Unitroller', unitrollerAddress);
  let tx = await unitroller._setPendingImplementation(comptroller.address);
  await tx.wait();
  tx = await comptroller._become(unitroller.address, { from: adminAddress });
  await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
