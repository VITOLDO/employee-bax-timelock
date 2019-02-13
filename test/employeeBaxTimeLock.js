const EmployeeBaxTimeLock = artifacts.require("EmployeeBaxTimeLock");
const BaxToken = artifacts.require("baxToken/BaxToken");
const { increaseTime } = require("../util/timeTraveler.js");
const DAY = 3600 * 24;

const Promise = require("bluebird");
Promise.allSeq = require("../util/sequentialPromise.js");
Promise.allNamed = require("../util/sequentialPromiseNamed.js");

const expectedExceptionPromise = require("../util/expectedException.js");

const maxGas = 5000000;

contract('EmployeeBaxTimeLock', (accounts) => {

    let owner, baxTokenInstance, employeeBaxTimeLockInstance, recipient, stranger, timeRange;

    before("should prepare", function() {
        assert.isAtLeast(accounts.length, 2);
        owner = accounts[0];
        recipient = accounts[1];
        stranger = accounts[2];
        timeRange = 10;
    });

    beforeEach("should deploy a new contracts and mint few tokens on it ", async () => {
        baxTokenInstance = await BaxToken.new({from: owner});
        employeeBaxTimeLockInstance = await EmployeeBaxTimeLock.new(baxTokenInstance.address, timeRange, {from: owner});

        await baxTokenInstance.mint(employeeBaxTimeLockInstance.address, 1000, {from: owner});

        const contractBAX = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();

        assert.equal(1000, contractBAX, "Tokens wasn't transferred to contract");
    });

    it('should put 10 as a default block range', async () => {
        const range = (await employeeBaxTimeLockInstance.getTimeRangeForWithdraw.call({from: owner})).toNumber();

        assert.equal(range, timeRange, "10 wasn't in the first account");
    });

    it('should be able to place deposit', () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 10, {from: owner})
            .then(tx => {
                assert.strictEqual(tx.receipt.logs.length, 1);
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");
                assert.strictEqual(logChanged.args._from, owner);
                assert.strictEqual(logChanged.args._recipient, recipient);
                assert.strictEqual(logChanged.args._amount.toNumber(), 40);
            });
    });

    it('withdraw before 1st unlock', () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then(tx => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                return employeeBaxTimeLockInstance.withdraw({from: recipient})
            }).then(tx => {
                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                return baxTokenInstance.balanceOf.call(recipient, {from: recipient});
            }).then(amount => {
                assert.strictEqual(0, amount.toNumber(), "Recipient shouldn't have received any tokens before 1st unlock");
            });
    });

    it('withdraw after 1st unlock', () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then(tx => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                return employeeBaxTimeLockInstance.withdraw({from: recipient})
            }).then(async (tx) => {
                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                await increaseTime(timeRange * 2);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then((tx) => {

                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(10,                      logChanged.args._amount.toNumber());

                return Promise.allNamed({
                        type0: () => baxTokenInstance.balanceOf(recipient, {from: recipient}),
                        type1: () => baxTokenInstance.balanceOf(employeeBaxTimeLockInstance.address, {from: owner})
                    })
                    .then(multipliers => {
                        assert.strictEqual(multipliers.type0.toNumber(), 10, "Recipient should have received only 10 tokens after 1st unlock");
                        assert.strictEqual(multipliers.type1.toNumber(), 990, "Contract balance should've been cutted by the amount of sent tokens to Recipient");
                    });
            });
    });

    it('withdraw after 1st unlock but not twice', () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then( tx => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

            return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                await increaseTime(timeRange * 2);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {

                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(10,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(10, amountRecipient, "Recipient should have received only 10 tokens after 1st unlock");
                assert.strictEqual(990, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {

                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(10, amountRecipient, "Recipient balance shouldn't have changed");
                assert.strictEqual(990, amountContract, "Contract balance shouldn't have changed");
            });
    });

    it('withdraw after 2nd unlock (1 call)', () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then( tx => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                await increaseTime(timeRange * 3);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(20,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(20, amountRecipient, "Recipient should have received only 10 tokens after 1st unlock");
                assert.strictEqual(980, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");
            });
    });

    it('withdraw after 2nd unlock (2 calls)', async () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then( tx => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                return employeeBaxTimeLockInstance.withdraw({from: recipient})
            }).then(async (tx) => {
                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                await increaseTime(timeRange * 2);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(10,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(10, amountRecipient, "Recipient should have received only 10 tokens after 1st unlock");
                assert.strictEqual(990, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");

                await increaseTime(timeRange);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(10,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(20, amountRecipient, "Recipient should have received only 10 tokens after 1st unlock");
                assert.strictEqual(980, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");
            });
    });

    it('withdraw after all unlocks (1 calls)', async () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then( tx => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                return employeeBaxTimeLockInstance.withdraw({from: recipient})
            }).then(async (tx) => {
                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                await increaseTime(timeRange * 5);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(40,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(40, amountRecipient, "Recipient should have received only 10 tokens after 1st unlock");
                assert.strictEqual(960, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");
            });
    });

    it('withdraw after all unlocks (multiple calls)', async () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then( tx => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                return employeeBaxTimeLockInstance.withdraw({from: recipient})
            }).then(async (tx) => {
                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(0,                       logChanged.args._amount.toNumber());

                await increaseTime(timeRange * 2);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(10,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(10, amountRecipient, "Recipient should have received only 10 tokens after 1st unlock");
                assert.strictEqual(990, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");

                await increaseTime(timeRange);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(10,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(20, amountRecipient, "Recipient should have received only 10 tokens after 1st unlock");
                assert.strictEqual(980, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");

                await increaseTime(timeRange * 2);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            }).then(async (tx) => {
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(20,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(40, amountRecipient, "Recipient should have received 40 tokens after all unlocks");
                assert.strictEqual(960, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");
            });
    });

    it('withdraw after 2nd unlock 1 deposit and 1st unlock 2 deposit', async () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then(async (tx) => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                await increaseTime(timeRange * 2);

                return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            }).then(async (tx) => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                await increaseTime(timeRange * 2);

                return employeeBaxTimeLockInstance.withdraw({from: recipient})
            }).then(async (tx) => {

                assert.strictEqual(1, tx.receipt.logs.length);
                assert.strictEqual(1, tx.logs.length);
                const logChanged = tx.logs[0];
                assert.strictEqual("LogDepositWithdraw",    logChanged.event);
                assert.strictEqual(recipient,               logChanged.args._recipient);
                assert.strictEqual(40,                      logChanged.args._amount.toNumber());

                const amountRecipient = (await baxTokenInstance.balanceOf.call(recipient, {from: recipient})).toNumber();
                const amountContract = (await baxTokenInstance.balanceOf.call(employeeBaxTimeLockInstance.address, {from: owner})).toNumber();
                assert.strictEqual(40, amountRecipient, "Recipient should have received only 40 tokens after 1st unlock");
                assert.strictEqual(960, amountContract, "Contract balance should've been cutted by the amount of sent tokens to Recipient");

                await increaseTime(timeRange);

                return employeeBaxTimeLockInstance.withdraw({from: recipient});
            })
    });

    it('cannot withdraw if deposit not mine', async () => {
        return employeeBaxTimeLockInstance.depositCoin(recipient, 40, 0, {from: owner})
            .then(async (tx) => {
                assert.strictEqual(tx.logs.length, 1);
                const logChanged = tx.logs[0];
                assert.strictEqual(logChanged.event, "LogDepositPlaced");

                await increaseTime(timeRange * 2);

                return expectedExceptionPromise(() => employeeBaxTimeLockInstance.withdraw({from: stranger}), maxGas);

            });
    });
});
