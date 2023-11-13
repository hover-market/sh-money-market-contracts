import { FakeContract, smock } from '@defi-wonderland/smock';
import { loadFixture, mine, time} from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import { deployQuadrataGateway } from './../utils';

use(smock.matchers);

// EXAMPLES from Fuji testnet QuadrataReader
// https://testnet.snowtrace.io/address/0x49CF5d391B223E9196A7f5927A44D57fec1244C8
// US country[[0x627fe66dd064a0a7d686e05b87b04d5a7c585907afae1f0c65ab27fa379ca189,1686081690,0x19c6525E6927554e311Cd83491d34623fF04605a]]
// BR country[[0x22cdf6b0c8b07725eb7a1a05c898e25b885b163787fdc10543b114a6cccc849b,1686081690,0x19c6525E6927554e311Cd83491d34623fF04605a]]

describe('QuadrataGateway Tests', () => {    
  const US_COUNTRY = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('US'));
  const CA_COUNTRY = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('CA'));
  const BR_COUNTRY = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BR'));
  const CU_COUNTRY = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('CU'));
  const QUADRATA_QUERIER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('QUADRATA_QUERIER_ROLE'));  
  const QUADRATA_CACHE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('QUADRATA_CACHE_ROLE'));  
  const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;  
  const fakeIssuer1 = '0x19c6525E6927554e311Cd83491d34623fF04605a';
  const fakeIssuer2 = '0xC6D1C9b8E605C0777fFD7A7528A5E8b98900EBE1';
  const fakeIssuer3 = '0x7695513b9c91e2FF73D74eCEAB0f086D84e786Ee';
  const fakeIssuer4 = '0x4E28B045b0250cb82E1a28B06F6Ac4b60Ac98065';
  const fakeEpoch = 1686081690;
  const days7 = 86400 * 7;  
  
  let quadrataGateway: Contract;
  let quadrataReaderFake: FakeContract;
  let admin: SignerWithAddress;
  let querier: SignerWithAddress;  
  let userA: SignerWithAddress;
  let userB: SignerWithAddress;
  
  async function loadInitialScenario(){
    quadrataReaderFake = await smock.fake('IQuadReader');    
    ({quadrataGateway, admin } = await deployQuadrataGateway(quadrataReaderFake.address, days7));

    const signers = await ethers.getSigners();
    querier = signers[9];
    userA = signers[3];
    userB = signers[2];

    await quadrataGateway.connect(admin).grantRole(QUADRATA_QUERIER_ROLE, querier.address);
    await quadrataGateway.connect(admin).grantRole(QUADRATA_CACHE_ROLE, querier.address);
    await quadrataGateway.connect(admin).addCountriesToBlocklist([US_COUNTRY, CA_COUNTRY]);
  }
  
  describe('allowed', async () => {
    describe('caller is member of QUADRATA_QUERIER_ROLE', async() =>{
      describe('US Country', async() =>{
        before(async()=>{
          await loadFixture(loadInitialScenario);
          quadrataReaderFake.getAttributes.returns([{value: US_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);  
        })        
        it('should return false', async () => {      
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
             .to.eventually.be.equal(false);
        })
      })
      describe('CA Country', async() =>{
        before(async()=>{
          await loadFixture(loadInitialScenario);
          quadrataReaderFake.getAttributes.returns([{value: US_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);  
        })        
        it('should return false', async () => {      
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
             .to.eventually.be.equal(false);
        })
      })
      describe('BR Country', async()=>{
        before(async()=>{
          await loadFixture(loadInitialScenario);
          quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);
        })       
        it('should return true', async () => {
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
            .to.be.eventually.equal(true);
        })
      })
      describe('user without Country info', async()=>{
        before(async()=>{
          await loadFixture(loadInitialScenario);
          quadrataReaderFake.getAttributes.returns([]);
        })       
        it('should return false', async () => {
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
            .to.be.eventually.equal(false);
        })
      })
      describe('empty blocked countries list', async()=>{
        before(async()=>{
          await loadFixture(loadInitialScenario);
          
          await quadrataGateway.connect(admin).removeCountriesFromBlocklist([US_COUNTRY, CA_COUNTRY]);
        })       
        it('should revert with allowed: invalid blocklisted countries length' , async () => {
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
            .to.be.revertedWith('allowed: invalid blocklisted countries length');
        })
      })
      describe('multiple passport issuers', async() =>{
        describe('allowed countries', async() =>{
          describe('all same', async()=>{
            before(async()=>{
              await loadFixture(loadInitialScenario);
              quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
                , epoch: fakeEpoch
                , issuer: fakeIssuer1},
                {value: BR_COUNTRY
                  , epoch: fakeEpoch
                  , issuer: fakeIssuer2},
                  {value: BR_COUNTRY
                    , epoch: fakeEpoch
                    , issuer: fakeIssuer3}]);
            })       
            it('should return true', async () => {
              await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
                .to.be.eventually.equal(true);
            })
          })
          describe('not same', async()=>{
            before(async()=>{
              await loadFixture(loadInitialScenario);
              quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
                , epoch: fakeEpoch
                , issuer: fakeIssuer1},
                {value: BR_COUNTRY
                  , epoch: fakeEpoch
                  , issuer: fakeIssuer2},
                  {value: CU_COUNTRY
                    , epoch: fakeEpoch
                    , issuer: fakeIssuer3}]);
            })       
            it('should return true', async () => {
              await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
                .to.be.eventually.equal(true);
            })
          })         
        })
        describe('blocked countries', async() =>{
          describe('all same', async()=>{
            before(async()=>{
              await loadFixture(loadInitialScenario);
              quadrataReaderFake.getAttributes.returns([{value: CA_COUNTRY
                , epoch: fakeEpoch
                , issuer: fakeIssuer1},
                {value: CA_COUNTRY
                  , epoch: fakeEpoch
                  , issuer: fakeIssuer2},
                  {value: CA_COUNTRY
                    , epoch: fakeEpoch
                    , issuer: fakeIssuer3}]);
            })       
            it('should return false', async () => {
              await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
                .to.be.eventually.equal(false);
            })
          })
          describe('not same', async()=>{
            before(async()=>{
              await loadFixture(loadInitialScenario);
              quadrataReaderFake.getAttributes.returns([{value: CA_COUNTRY
                , epoch: fakeEpoch
                , issuer: fakeIssuer1},
                {value: CA_COUNTRY
                  , epoch: fakeEpoch
                  , issuer: fakeIssuer2},
                  {value: US_COUNTRY
                    , epoch: fakeEpoch
                    , issuer: fakeIssuer3}]);
            })       
            it('should return false', async () => {
              await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
                .to.be.eventually.equal(false);
            })
          })         
        })
        describe('allowed and blocked countries', async() =>{          
          before(async()=>{
            await loadFixture(loadInitialScenario);
            quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
              , epoch: fakeEpoch
              , issuer: fakeIssuer1},
              {value: US_COUNTRY
                , epoch: fakeEpoch
                , issuer: fakeIssuer2},
              {value: CA_COUNTRY
                , epoch: fakeEpoch
                , issuer: fakeIssuer3},
                {value: CU_COUNTRY
                  , epoch: fakeEpoch
                  , issuer: fakeIssuer4}]);
          })       
          it('should return false', async () => {
            await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
              .to.be.eventually.equal(false);
          })                 
        })   
      })
    })
    describe('caller not member of QUADRATA_QUERIER_ROLE', async()=>{    
      before(async()=>{
        await loadFixture(loadInitialScenario);
      })          
      it('should revert with AccessControl validation', async () => {      
        await expect(quadrataGateway.connect(admin).callStatic.allowed(userA.address))
            .to.be.revertedWith(`AccessControl: account ${admin.address.toLocaleLowerCase()} is missing role ${QUADRATA_QUERIER_ROLE}`);
      })      
    })
  })
  describe('passportCache', async()=>{    
    describe('empty cache', async()=>{      
      before(async()=>{
        await loadFixture(loadInitialScenario);    
        quadrataReaderFake.getAttributes.returns([{value: US_COUNTRY
          , epoch: fakeEpoch
          , issuer: fakeIssuer1}]);          
      })     
      it('should not allow', async()=>{
        await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(false);
      })
      it('should call quadrata reader', async()=>{
        expect(quadrataReaderFake.getAttributes).to.have.been.called;
      })
      describe('should fill the cache', async()=>{
        let cache:any;
        let expectedExpiresIn: number;
        before(async()=> {
          await quadrataGateway.connect(querier).allowed(userA.address);
          cache = await quadrataGateway.connect(querier).callStatic.getCache(userA.address);
          expectedExpiresIn = await time.latest() + days7;
        })
        it('validate value', async()=>{          
          await expect(cache.value).to.be.equal(false);
        })
        it('validate expiresIn', async()=>{          
          await expect(cache.expiresIn).to.be.equal(expectedExpiresIn);
        })
      })      
    })
    describe('filled cache', async()=>{            
      before(async()=>{
        await loadFixture(loadInitialScenario);
        quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
        , epoch: fakeEpoch
        , issuer: fakeIssuer1}]);        

        await quadrataGateway.connect(querier).allowed(userA.address);        
        
        quadrataReaderFake.getAttributes.reset();        
      })      
      it('should allow', async()=>{
        await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(true);
      })  
      it('should not call quadrata reader', async()=>{
        expect(quadrataReaderFake.getAttributes).to.not.have.been.called;
      }) 
      describe('after 7 days - 1 sec...', async()=>{
        before(async()=>{
          await mine(days7-1);
        })       
        it('should allow', async()=>{
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(true);
        }) 
        it('should not call quadrata reader', async()=>{
          expect(quadrataReaderFake.getAttributes).to.not.have.been.called;
        })
      })
    })    
    describe('update old cache', async()=>{      
      before(async()=>{
        await loadFixture(loadInitialScenario);
        quadrataReaderFake.getAttributes.returns([{value: US_COUNTRY
        , epoch: fakeEpoch
        , issuer: fakeIssuer1}]);        

        await quadrataGateway.connect(querier).allowed(userA.address);        

        quadrataReaderFake.getAttributes.reset();
      })
      describe('validate cache for old value', async()=>{       
        it('should not allow', async()=>{
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(false);
        })
        it('should not call quadrata reader', async()=>{
          expect(quadrataReaderFake.getAttributes).to.have.not.been.called;
        })
      })      
      describe('after 7 days...', async() =>{
        const blocksToMine = days7;
        before(async()=>{
          await mine(blocksToMine);
                   
          await quadrataGateway.connect(querier).allowed(userA.address);
        })
        describe('validate cache for new values', async()=>{         
          it('should not allow', async()=>{
            await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(false);
          })
          it('should call quadrata reader', async()=>{
            expect(quadrataReaderFake.getAttributes).to.have.been.called;
          })
        })        
      })      
    })
    describe('should not save cache for users without country info', async()=>{
      before(async()=>{
        await loadFixture(loadInitialScenario);
        quadrataReaderFake.getAttributes.returns([]);        
      
        await quadrataGateway.connect(querier).allowed(userA.address);  
        
        quadrataReaderFake.getAttributes.reset();
      })
      describe('validate empty cache', async() =>{       
        it('should not allow', async()=>{
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(false);
        })
        it('should call quadrata reader', async()=>{
          expect(quadrataReaderFake.getAttributes).to.have.been.called;
        })
      })
      describe('validate that the still empty', async() =>{       
        it('should not allow', async()=>{
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(false);
        })
        it('should call quadrata reader', async()=>{
          expect(quadrataReaderFake.getAttributes).to.have.been.called;
        })
      })
    })
  })
  describe('clearCache', async()=>{
    describe('caller is member of DEFAULT_ADMIN_ROLE', async()=>{
      let addressesToClear: string[] = [];
      let expectedCacheLengthAfterClear: number;
      before(async()=>{
        await loadFixture(loadInitialScenario);
        quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
        , epoch: fakeEpoch
        , issuer: fakeIssuer1}]);        
  
        const signers = await ethers.getSigners();
            
        for(let i = 0; i < signers.length; i++){
          await quadrataGateway.connect(querier).allowed(signers[i].address);
          if(i%2){
            addressesToClear.push(signers[i].address);
          }
        }
        expectedCacheLengthAfterClear = signers.length/2;        
        await quadrataGateway.connect(querier).allowed(userA.address);
        
        quadrataReaderFake.getAttributes.reset();
      })
      describe('validate cache before clear', async()=>{        
        it('should allow', async()=>{
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(true);
        })
        it('should not call quadrata reader', async()=>{
          expect(quadrataReaderFake.getAttributes).to.not.have.been.called;
        })
      })        
      describe('validate cache after clear', async() =>{            
        before(async()=>{
          quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);
        })
        it('should clear cache', async()=>{
          await expect(quadrataGateway.connect(admin).clearCache(addressesToClear)).to.not.be.reverted;
          
        })
        it('validate cache length', async()=>{
          await expect(quadrataGateway.connect(admin).callStatic.getCacheLength()).to.eventually.be.equal(expectedCacheLengthAfterClear)
        })
        describe('valide user cache', async()=>{
          let cache:any;
          before(async()=>{
            cache = await quadrataGateway.connect(querier).callStatic.getCache(userA.address);   
          })
          it('validate value', async()=>{          
            await expect(cache.value).to.be.equal(false);
          })
          it('validate expiresIn', async()=>{          
            await expect(cache.expiresIn).to.be.equal(0);
          })
          it('should allow', async()=>{
            await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(true);
          })
          it('should call quadrata reader', async()=>{
            expect(quadrataReaderFake.getAttributes).to.have.been.called;
          })
        })
      })
    }) 
    describe('caller not member of DEFAULT_ADMIN_ROLE', async()=>{          
      before(async()=>{
        await loadFixture(loadInitialScenario);
      })          
      it('should revert with AccessControl validation', async () => {      
        await expect(quadrataGateway.connect(querier).callStatic.clearCache([]))
            .to.be.revertedWith(`AccessControl: account ${querier.address.toLocaleLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
      })     
    })                     
  })
  describe('revokeRole', async()=>{
    before(async()=>{
      await loadFixture(loadInitialScenario);                
    })     
    it('user must be part of role QUADRATA_QUERIER_ROLE', async()=>{
      await expect(quadrataGateway.callStatic.hasRole(QUADRATA_QUERIER_ROLE, querier.address)).to.eventually.be.equal(true);
    })
    it('should emit RoleRevoked(role, account, _msgSender())', async () => {      
      await expect(quadrataGateway.connect(admin).revokeRole(QUADRATA_QUERIER_ROLE, querier.address))
        .to.emit(quadrataGateway, 'RoleRevoked')
        .withArgs(QUADRATA_QUERIER_ROLE, querier.address, admin.address);          
    })      
    it('user must not be part of role QUADRATA_QUERIER_ROLE', async()=>{
      await expect(quadrataGateway.callStatic.hasRole(QUADRATA_QUERIER_ROLE, querier.address)).to.eventually.be.equal(false);
    })
  })
  describe('updatePassportCacheExpirationTime', async()=>{
    describe('check initial cache end period', async()=>{
      before(async()=>{
        await loadFixture(loadInitialScenario);   
        quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
          , epoch: fakeEpoch
          , issuer: fakeIssuer1}]);        
  
          await quadrataGateway.connect(querier).allowed(userA.address);        
          
          quadrataReaderFake.getAttributes.reset();
          await mine(days7 - 1);
      })     
      it('should allow', async()=>{
        await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(true);
      })  
      it('should not call quadrata reader', async()=>{
        expect(quadrataReaderFake.getAttributes).to.not.have.been.called;
      }) 
      describe('update passport cache expiration time to 14 days and change user country...', async()=>{        
        const newCacheExpirationTime = days7 * 2;
        before(async()=>{
          quadrataReaderFake.getAttributes.returns([{value: US_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);
        })
        it('should emit NewPassportCacheExpirationTime', async()=>{
          await expect(quadrataGateway.connect(admin).updatePassportCacheExpirationTime(newCacheExpirationTime))
            .to.emit(quadrataGateway, 'NewPassportCacheExpirationTime')
            .withArgs(days7, newCacheExpirationTime);
        })
        describe('cached values should not change', async()=>{
          it('should allow', async()=>{
            await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(true);
          }) 
          it('should not call quadrata reader', async()=>{
            expect(quadrataReaderFake.getAttributes).to.not.have.been.called;
          })
          describe('after 1 second...', async()=>{
            before(async()=>{
              await mine(1);
            })
            describe('cached values should change to new country', async()=>{
              it('should allow', async()=>{
                await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address)).to.be.eventually.equal(false);
              }) 
              it('should not call quadrata reader', async()=>{
                expect(quadrataReaderFake.getAttributes).to.have.been.called;
              })
            })
          })
        }) 
      })
    })    
  })
  describe('clearAllCache', async()=>{
    describe('caller is member of DEFAULT_ADMIN_ROLE', async() =>{ 
      describe('valid parameters', async()=>{
        describe('remove all entries', async()=>{
          let expectedCacheLengh: number;
          let getCacheLengthCall: any; 
          before(async()=>{
            await loadFixture(loadInitialScenario);  
            quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
              , epoch: fakeEpoch
              , issuer: fakeIssuer1}]);        
            
            const signers = await ethers.getSigners();
            
            for(let i = 0; i < signers.length; i++){
              await quadrataGateway.connect(querier).allowed(signers[i].address);
            }
            expectedCacheLengh = signers.length;
            getCacheLengthCall = quadrataGateway.connect(admin).getCacheLength();
          })
          it('validate cache size before call', async()=>{
            await expect(getCacheLengthCall).to.eventually.be.equal(expectedCacheLengh);
          })
          it('should emit PassportCacheWiped', async () => {
            const cacheLength = await getCacheLengthCall;  
            await expect(quadrataGateway.connect(admin).clearAllCache(cacheLength))
              .to.emit(quadrataGateway, 'PassportCacheWiped');
          })
          it('validate cache size after call', async()=>{
            await expect(quadrataGateway.connect(admin).getCacheLength()).to.eventually.be.equal(0);
          })
        })
        describe('remove half of entries', async()=>{
          let expectedCacheLengh: number;
          let getCacheLengthCall: any; 
          before(async()=>{
            await loadFixture(loadInitialScenario);  
            quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
              , epoch: fakeEpoch
              , issuer: fakeIssuer1}]);        
            
            const signers = await ethers.getSigners();
            
            for(let i = 0; i < signers.length; i++){
              await quadrataGateway.connect(querier).allowed(signers[i].address);
            }
            expectedCacheLengh = signers.length;
            getCacheLengthCall = quadrataGateway.connect(admin).getCacheLength();
          })
          it('validate cache size before call', async()=>{
            await expect(getCacheLengthCall).to.eventually.be.equal(expectedCacheLengh);
          })
          it('should emit PassportCacheWiped', async () => {
            const cacheLength = await getCacheLengthCall;  
            await expect(quadrataGateway.connect(admin).clearAllCache(cacheLength/2))
              .to.emit(quadrataGateway, 'PassportCacheWiped');
          })
          it('validate cache size after call', async()=>{
            await expect(quadrataGateway.connect(admin).getCacheLength()).to.eventually.be.equal(expectedCacheLengh/2);
          })
        })
        
      })
      describe('invalid cache length', async()=>{
        before(async()=>{
          await loadFixture(loadInitialScenario);         
        })
        it('should revert with clearAllCache: invalid cache length', async () => {          
          await expect(quadrataGateway.connect(admin).clearAllCache(0))
          .to.be.revertedWith('clearAllCache: invalid cache length');
        })
      }) 
      describe('invalid nunberOfEntriesToRemove', async()=>{
        let expectedCacheLengh = 2;
        let getCacheLengthCall: any; 
        before(async()=>{
          await loadFixture(loadInitialScenario);  
          quadrataReaderFake.getAttributes.returns([{value: BR_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);        
    
          await quadrataGateway.connect(querier).allowed(userA.address);       
          await quadrataGateway.connect(querier).allowed(userB.address);
          getCacheLengthCall = quadrataGateway.connect(admin).getCacheLength();
        })
        it('validate cache size before call', async()=>{
          await expect(getCacheLengthCall).to.eventually.be.equal(expectedCacheLengh);
        })
        it('should revert with clearAllCache: invalid nunberOfEntriesToRemove', async () => {          
          await expect(quadrataGateway.connect(admin).clearAllCache(0))
          .to.be.revertedWith('clearAllCache: invalid nunberOfEntriesToRemove');
        })
        it('validate cache size after call', async()=>{
          await expect(quadrataGateway.connect(admin).getCacheLength())
            .to.eventually.be.equal(expectedCacheLengh);
        })
      })     
    })
    describe('caller not member of DEFAULT_ADMIN_ROLE', async()=>{          
      before(async()=>{
        await loadFixture(loadInitialScenario);
      })          
      it('should revert with AccessControl validation', async () => {      
        await expect(quadrataGateway.connect(querier).callStatic.clearAllCache(1))
            .to.be.revertedWith(`AccessControl: account ${querier.address.toLocaleLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
      })     
    })
  })
  describe('addCountriesToBlocklist', async()=>{
    describe('caller is member of DEFAULT_ADMIN_ROLE', async() =>{
      describe('empty countries list', async()=>{
        before(async()=>{
          await loadFixture(loadInitialScenario);                 
        })
        it('should revert, addCountriesToBlocklist: invalid length', async()=>{
          await expect(quadrataGateway.connect(admin).addCountriesToBlocklist([]))
            .to.be.revertedWith('addCountriesToBlocklist: invalid length');
        })
      })
      describe('CU Country', async() =>{
        let allowedBeforeBlock: boolean;
        let addCountriesCall: any;
        before(async()=>{
          await loadFixture(loadInitialScenario);
          quadrataReaderFake.getAttributes.returns([{value: CU_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);

          allowedBeforeBlock = await quadrataGateway.connect(querier).callStatic.allowed(userA.address);
          
          addCountriesCall = await quadrataGateway.connect(admin).addCountriesToBlocklist([CU_COUNTRY]);
        })
        it('validate allowed status before update, should return true', async () => {      
          await expect(allowedBeforeBlock).to.be.equal(true);
        })               
        it('validate allowed status after update, should return false', async () => {      
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
             .to.eventually.be.equal(false);
        })
        it('should emit CountryAddedToBlocklist', async()=>{
          await expect(addCountriesCall)
            .to.emit(quadrataGateway, 'CountryAddedToBlocklist')
            .withArgs(CU_COUNTRY);
        })
      })     
    })
    describe('caller not member of DEFAULT_ADMIN_ROLE', async()=>{    
      before(async()=>{
        await loadFixture(loadInitialScenario);
      })          
      it('should revert with AccessControl validation', async () => {      
        await expect(quadrataGateway.connect(querier).addCountriesToBlocklist([CU_COUNTRY]))
            .to.be.revertedWith(`AccessControl: account ${querier.address.toLocaleLowerCase()} is missing role ${ethers.constants.HashZero}`);
      })      
    })
  })
  describe('removeCountriesFromBlocklist', async()=>{
    describe('caller is member of DEFAULT_ADMIN_ROLE', async() =>{
      describe('empty countries list', async()=>{
        before(async()=>{
          await loadFixture(loadInitialScenario);         
        })
        it('should revert, removeCountriesFromBlocklist: invalid length', async()=>{
          await expect(quadrataGateway.connect(admin).removeCountriesFromBlocklist([]))
            .to.be.revertedWith('removeCountriesFromBlocklist: invalid length');
        })        
      })
      describe('US Country', async() =>{
        let allowedBeforeBlock: boolean;
        let removeCountriesCall: any;
        before(async()=>{
          await loadFixture(loadInitialScenario);
          quadrataReaderFake.getAttributes.returns([{value: US_COUNTRY
            , epoch: fakeEpoch
            , issuer: fakeIssuer1}]);

          allowedBeforeBlock = await quadrataGateway.connect(querier).callStatic.allowed(userA.address);
          
          removeCountriesCall = await quadrataGateway.connect(admin).removeCountriesFromBlocklist([US_COUNTRY]);
        })
        it('validate allowed status before update, should return false', async () => {      
          await expect(allowedBeforeBlock).to.be.equal(false);
        })               
        it('validate allowed status after update, should return true', async () => {      
          await expect(quadrataGateway.connect(querier).callStatic.allowed(userA.address))
             .to.eventually.be.equal(true);
        })
        it('should emit CountryRemovedFromBlocklist', async()=>{
          await expect(removeCountriesCall)
            .to.emit(quadrataGateway, 'CountryRemovedFromBlocklist')
            .withArgs(US_COUNTRY);
        })
      })     
    })
    describe('caller not member of DEFAULT_ADMIN_ROLE', async()=>{    
      before(async()=>{
        await loadFixture(loadInitialScenario);
      })          
      it('should revert with AccessControl validation', async () => {      
        await expect(quadrataGateway.connect(querier).addCountriesToBlocklist([CU_COUNTRY]))
            .to.be.revertedWith(`AccessControl: account ${querier.address.toLocaleLowerCase()} is missing role ${ethers.constants.HashZero}`);
      })      
    })
  })
})
