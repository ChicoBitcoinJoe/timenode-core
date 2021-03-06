import * as TypeMoq from 'typemoq';
import { assert } from 'chai';
import BigNumber from 'bignumber.js';
import { ILedger, Ledger } from '../../src/Actions/Ledger';
import { IStatsDB } from '../../src/Stats/StatsDB';
import { Operation } from '../../src/Types/Operation';
import { TransactionReceipt, Log } from 'web3/types';
import { ITransactionRequest } from '@ethereum-alarm-clock/lib';

const account1: string = '0xd0700ed9f4d178adf25b45f7fa8a4ec7c230b098';
const account2: string = '0x0054a7eef4dc5d729115c71cba074151b3d41804';

const tx1: string = '0xaa55bf414ecef0285dcece4ddf78a0ee8beb6707';

const gas = new BigNumber('100000');
const gasPrice = new BigNumber(100000000);
const requiredDeposit = new BigNumber(10000000);
const opts = {
  to: account1,
  value: new BigNumber(0),
  gas,
  gasPrice,
  data: '0x0',
  operation: Operation.EXECUTE
};

let ledger: ILedger;
let stats: TypeMoq.IMock<IStatsDB>;

const txRequest = TypeMoq.Mock.ofType<ITransactionRequest>();
txRequest.setup(x => x.requiredDeposit).returns(() => requiredDeposit);
txRequest.setup(x => x.address).returns(() => tx1);

const reset = async () => {
  stats = TypeMoq.Mock.ofType<IStatsDB>();
  ledger = new Ledger(stats.object);
};

beforeEach(reset);

describe('Ledger Unit Tests', async () => {
  it('should account for required deposit and tx cost when claiming was successful', async () => {
    const receipt = TypeMoq.Mock.ofType<TransactionReceipt>();
    receipt.setup(r => r.status).returns(() => true);
    receipt.setup(r => r.gasUsed).returns(() => gas.toNumber());

    ledger.accountClaiming(receipt.object, txRequest.object, opts, account2);

    const expectedCost = gasPrice.mul(gas).add(requiredDeposit);

    assert.doesNotThrow(() =>
      stats.verify(x => x.claimed(account2, tx1, expectedCost, true), TypeMoq.Times.once())
    );
  });

  it('should account for tx cost when claiming failed', async () => {
    const receipt = TypeMoq.Mock.ofType<TransactionReceipt>();
    receipt.setup(r => r.status).returns(() => false);
    receipt.setup(r => r.gasUsed).returns(() => gas.toNumber());

    ledger.accountClaiming(receipt.object, txRequest.object, opts, account2);

    const expectedCost = gasPrice.mul(gas);

    assert.doesNotThrow(() =>
      stats.verify(x => x.claimed(account2, tx1, expectedCost, false), TypeMoq.Times.once())
    );
  });

  it('should account for bounty only when execution was successful', async () => {
    const log = TypeMoq.Mock.ofType<Log>();
    log
      .setup(l => l.data)
      .returns(
        () =>
          '0x000000000000000000000000000000000000000000000000000fe3c87f4b736300000000000000000000000000000000000000000000000000000002540be4000000000000000000000000000000000000000000000000000000000000030cd6'
      );

    const receipt = TypeMoq.Mock.ofType<TransactionReceipt>();
    receipt.setup(r => r.status).returns(() => true);
    receipt.setup(r => r.gasUsed).returns(() => gas.toNumber());
    receipt.setup(r => r.logs).returns(() => [log.object]);

    ledger.accountExecution(txRequest.object, receipt.object, opts, account2, true);

    const gasUsed = new BigNumber(receipt.object.gasUsed);
    const actualGasPrice = opts.gasPrice;
    const expectedCost = new BigNumber(0);
    const expectedReward = new BigNumber(
      '0x000000000000000000000000000000000000000000000000000fe3c87f4b7363'
    ).sub(gasUsed.mul(actualGasPrice));

    assert.doesNotThrow(() =>
      stats.verify(
        x => x.executed(account2, tx1, expectedCost, expectedReward, true),
        TypeMoq.Times.once()
      )
    );
  });

  it('should account for tx costs when execution was not successful', async () => {
    const receipt = TypeMoq.Mock.ofType<TransactionReceipt>();
    receipt.setup(r => r.status).returns(() => false);
    receipt.setup(r => r.gasUsed).returns(() => gas.toNumber());

    ledger.accountExecution(txRequest.object, receipt.object, opts, account2, false);

    const expectedReward = new BigNumber(0);
    const expectedCost = gasPrice.mul(gas);

    assert.doesNotThrow(() =>
      stats.verify(
        x => x.executed(account2, tx1, expectedCost, expectedReward, false),
        TypeMoq.Times.once()
      )
    );
  });
});
