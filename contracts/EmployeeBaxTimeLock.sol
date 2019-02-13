pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./Owned.sol";

// This is just a simple example of a coin-like contract.
// It is not standards compatible and cannot be expected to talk to other
// coin/token contracts. If you want to create a standards-compliant
// token, see: https://github.com/ConsenSys/Tokens. Cheers!

contract EmployeeBaxTimeLock is Owned {

	mapping (address => Deposit[]) private deposits;
	mapping (address => uint) private totalDeposits;
	address private erc20address;
	uint private timeRangeForWithdraw;

	uint private totalDeposited;

	ERC20 public ERC20Interface;

	struct Deposit {
		uint amount_;
		uint sent_;
		uint startingTime_;
	}
	event LogDepositPlaced(address indexed _from, address indexed _recipient, uint _amount, uint _blockStart);
	event LogDepositWithdraw(address indexed _recipient, uint _amount, uint _when);

	constructor(address _erc20address, uint _timeRangeForWithdraw) public {
		require(_erc20address != address(0));
		timeRangeForWithdraw = _timeRangeForWithdraw;
		erc20address = _erc20address;
	}

	function depositCoin(address recipient, uint amount, uint delaySeconds) public fromOwner returns(bool success) {
		require(amount > 0);
		require(amount % 4 == 0);
		require(recipient != address(0));
		require(ERC20(erc20address).balanceOf(address(this)) >= (totalDeposited + amount));

		totalDeposited += amount;

		// schedule BAX that needs to be transferred
		deposits[recipient].push(Deposit({amount_: amount, sent_: 0, startingTime_: block.timestamp + delaySeconds}));
		totalDeposits[recipient] += amount;

		emit LogDepositPlaced(msg.sender, recipient, amount, block.timestamp + delaySeconds);

		return true;
	}

	function withdraw() public returns(bool success) {
		require(totalDeposits[msg.sender] > 0);

		// calculate how much should be sent to recipient
		uint amountToSend = 0;
		for (uint i = 0; deposits[msg.sender].length > i; i++) {
			Deposit storage deposit = deposits[msg.sender][i];
			uint times = uint ((block.timestamp - deposit.startingTime_) / timeRangeForWithdraw);

			if (block.timestamp > deposit.startingTime_ && deposit.sent_ < deposit.amount_ && times > 1) {

				if (times > 5) {
					times = 5;
				}
				// It's always better to do multiplication first
				amountToSend += ((deposit.amount_ * (times - 1)) / 4) - deposit.sent_;
				deposit.sent_ += amountToSend;
			}
		}

		// send BAX to recipient
		ERC20(erc20address).transfer(msg.sender, amountToSend);
		totalDeposited -= amountToSend;

		emit LogDepositWithdraw(msg.sender, amountToSend, block.timestamp);

		return true;
	}

	function getTimeRangeForWithdraw() public view returns(uint) {
		return timeRangeForWithdraw;
	}
}
