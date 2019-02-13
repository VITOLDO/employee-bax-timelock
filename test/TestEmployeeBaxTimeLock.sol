pragma solidity ^0.4.24;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/EmployeeBaxTimeLock.sol";

contract TestEmployeeBaxTimeLock {

  function testInitialBalanceUsingDeployedContract() public {
    EmployeeBaxTimeLock timeLock = EmployeeBaxTimeLock(DeployedAddresses.EmployeeBaxTimeLock());

    uint expected = 10;

    Assert.equal(timeLock.getTimeRangeForWithdraw(), expected, "Default block range should be 10 initially");
  }

}
