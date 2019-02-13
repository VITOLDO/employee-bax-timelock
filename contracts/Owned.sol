pragma solidity ^0.4.24;

contract Owned {

    event LogOwnerSet(address indexed previousOwner, address indexed newOwner);

    address private owner;

    modifier fromOwner() {require(msg.sender == owner); _;}

    constructor() public { owner = msg.sender;}

    function setOwner(address newOwner)
        public fromOwner returns(bool success)
    {
        require(newOwner != msg.sender);
        require(newOwner != address(0));

        emit LogOwnerSet(owner, newOwner);
        owner = newOwner;

        return true;
    }

    function getOwner() view public returns(address _owner)
    {
        return owner;
    }

}