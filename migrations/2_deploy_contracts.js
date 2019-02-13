const EmployeeBaxTimeLock = artifacts.require("EmployeeBaxTimeLock");
const BaxToken = artifacts.require("baxToken/BaxToken");

module.exports = function(deployer) {
    deployer.deploy(BaxToken).then(function() {
        return deployer.deploy(EmployeeBaxTimeLock, BaxToken.address, 10)
    });
};
