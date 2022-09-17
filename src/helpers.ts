import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts/index'
import { store, log } from '@graphprotocol/graph-ts'
import {
    Ask,
    Bid,
    Currency,
    InactiveAsk,
    InactiveBid,
    InactiveReserveListingBid,
    Space,
    ReserveListing,
    ReserveListingBid,
    Transfer,
    URIUpdate,
    User,
    Land
} from '../types/schema'
import { Space as SpaceContract } from '../types/Space/Space'
import { SpaceExchange as SpaceExchangeContract } from '../types/SpaceExchange/SpaceExchange'
import { ERC20 } from '../types/SpaceExchange/ERC20'
import { ERC20NameBytes } from '../types/SpaceExchange/ERC20NameBytes'
import { ERC20SymbolBytes } from '../types/SpaceExchange/ERC20SymbolBytes'

export const zeroAddress = '0x0000000000000000000000000000000000000000'

/**
 *  helper class to model BidShares
 */
export class BidShares {
    creator: BigInt
    owner: BigInt
    prevOwner: BigInt

    constructor(creator: BigInt, owner: BigInt, prevOwner: BigInt) {
        this.creator = creator
        this.owner = owner
        this.prevOwner = prevOwner
    }
}

/**
 * Find or Create a User entity with `id` and return it
 * @param id
 */
export function findOrCreateUser(id: string): User {
    let user = User.load(id)

    if (user == null) {
        user = new User(id)
        user.save()
    }

    return user as User
}

/**
 * Find or Create a Currency entity with `id` and return it
 * @param id
 */
export function findOrCreateCurrency(id: string): Currency {
    let currency = Currency.load(id)

    if (currency == null) {
        currency = createCurrency(id)
    }

    return currency as Currency
}

/**
 * Create a Currency Entity in storage.
 * Populate fields by fetching data from the blockchain.
 * @param id
 */
export function createCurrency(id: string): Currency {
    let currency = new Currency(id)
    currency.liquidity = BigInt.fromI32(0)

    if (id === zeroAddress) {
        currency.name = 'Ethereum'
        currency.symbol = 'ETH'
        currency.decimals = 18
        currency.save()
        return currency
    }

    let name = fetchCurrencyName(Address.fromString(id))
    let symbol = fetchCurrencySymbol(Address.fromString(id))
    let decimals = fetchCurrencyDecimals(Address.fromString(id))

    currency.name = name
    currency.symbol = symbol
    currency.decimals = decimals

    currency.save()
    return currency
}

/**
 * Fetch the BidShares for a piece of Space by Reading the Motif SpaceExchange Contract
 * @param tokenId
 * @param spaceAddress
 */
export function fetchSpaceBidShares(tokenId: BigInt, spaceAddress: Address): BidShares {
    let space = SpaceContract.bind(spaceAddress)
    let spaceExchangeAddress = space.spaceExchangeContract()
    let spaceExchange = SpaceExchangeContract.bind(spaceExchangeAddress)
    let bidSharesTry = spaceExchange.try_bidSharesForToken(tokenId)
    if (bidSharesTry.reverted) {
        return new BidShares(null, null, null)
    }

    return new BidShares(
        bidSharesTry.value.creator.value,
        bidSharesTry.value.owner.value,
        bidSharesTry.value.prevOwner.value
    )
}

export function fetchSpaceAddress(tokenId: BigInt, spaceExchangeAddress: Address): string {
    let spaceExchange = SpaceExchangeContract.bind(spaceExchangeAddress)
    let spaceAddress = spaceExchange.spaceContract()
    return spaceAddress.toHexString()
}


/**
 * Fetch the `decimals` from the specified ERC20 contract on the blockchain
 * @param currencyAddress
 */
export function fetchCurrencyDecimals(currencyAddress: Address): i32 {
    let contract = ERC20.bind(currencyAddress)
    // try types uint8 for decimals
    let decimalValue = null
    let decimalResult = contract.try_decimals()
    if (!decimalResult.reverted) {
        decimalValue = decimalResult.value
    }
    return decimalValue as i32
}

/**
 * Fetch the `symbol` from the specified ERC20 contract on the Blockchain
 * @param currencyAddress
 */
export function fetchCurrencySymbol(currencyAddress: Address): string {
    let contract = ERC20.bind(currencyAddress)
    let contractSymbolBytes = ERC20SymbolBytes.bind(currencyAddress)

    // try types string and bytes32 for symbol
    let symbolValue = 'unknown'
    let symbolResult = contract.try_symbol()
    if (symbolResult.reverted) {
        let symbolResultBytes = contractSymbolBytes.try_symbol()
        if (!symbolResultBytes.reverted) {
            // for broken pairs that have no symbol function exposed
            if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
                symbolValue = symbolResultBytes.value.toString()
            }
        }
    } else {
        symbolValue = symbolResult.value
    }

    return symbolValue
}

export function findLand(id: string): Land {
    let land = Land.load(id)
    return land as Land
}


/**
 * Fetch the `name` of the specified ERC20 contract on the blockchain
 * @param currencyAddress
 */
export function fetchCurrencyName(currencyAddress: Address): string {
    let contract = ERC20.bind(currencyAddress)
    let contractNameBytes = ERC20NameBytes.bind(currencyAddress)

    // try types string and bytes32 for name
    let nameValue = 'unknown'
    let nameResult = contract.try_name()
    if (nameResult.reverted) {
        let nameResultBytes = contractNameBytes.try_name()
        if (!nameResultBytes.reverted) {
            if (!isNullEthValue(nameResultBytes.value.toHexString())) {
                nameValue = nameResultBytes.value.toString()
            }
        }
    } else {
        nameValue = nameResult.value
    }

    return nameValue
}

 
/**
 * Create New Space Entity
 * @param id
 * @param owner
 * @param creator
 * @param prevOwner
 * @param contentURI
 * @param contentHash
 * @param metadataURI
 * @param metadataHash
 * @param creatorBidShare
 * @param ownerBidShare
 * @param prevOwnerBidShare
 * @param createdAtTimestamp
 * @param createdAtBlockNumber
 */
export function createSpace(
    id: string,
    transactionHash: string,
    owner: User,
    creator: User,
    prevOwner: User,
    contentURI: string,
    contentHash: Bytes,
    metadataURI: string,
    metadataHash: Bytes,  
    creatorBidShare: BigInt,
    ownerBidShare: BigInt,
    prevOwnerBidShare: BigInt,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt,
    lands: Array<BigInt>,
    pin: string
): Space {

    let space = new Space(id) 
    space.owner = owner.id
    space.transactionHash = transactionHash 
    space.creator = creator.id
    space.prevOwner = prevOwner.id
    space.contentURI = contentURI
    space.contentHash = contentHash
    space.metadataURI = metadataURI
    space.metadataHash = metadataHash  
    space.creatorBidShare = creatorBidShare
    space.ownerBidShare = ownerBidShare
    space.prevOwnerBidShare = prevOwnerBidShare
    space.createdAtTimestamp = createdAtTimestamp
    space.createdAtBlockNumber = createdAtBlockNumber
    space.lands = lands 
    space.pin = pin 
 
    space.save()
    return space
}

/**
 * Create New Ask Entity
 * @param id
 * @param amount
 * @param currency
 * @param space
 * @param createdAtTimestamp
 * @param createdAtBlockNumber
 */
export function createAsk(
    id: string,
    transactionHash: string,
    amount: BigInt,
    currency: Currency,
    space: Space,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt
): Ask {
    let ask = new Ask(id)
    ask.transactionHash = transactionHash
    ask.amount = amount
    ask.currency = currency.id
    ask.space = space.id
    ask.owner = space.owner
    ask.createdAtTimestamp = createdAtTimestamp
    ask.createdAtBlockNumber = createdAtBlockNumber

    ask.save()
    return ask
}

/**
 * Create New InactiveAsk Entity
 * @param id
 * @param space
 * @param type
 * @param amount
 * @param currency
 * @param owner
 * @param createdAtTimestamp
 * @param createdAtBlockNumber
 */
export function createInactiveAsk(
    id: string,
    transactionHash: string,
    space: Space,
    type: string,
    amount: BigInt,
    currency: Currency,
    owner: string,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt,
    inactivatedAtTimestamp: BigInt,
    inactivatedAtBlockNumber: BigInt
): InactiveAsk {
    let inactiveAsk = new InactiveAsk(id)

    inactiveAsk.type = type
    inactiveAsk.space = space.id
    inactiveAsk.amount = amount
    inactiveAsk.currency = currency.id
    inactiveAsk.owner = owner
    inactiveAsk.createdAtTimestamp = createdAtTimestamp
    inactiveAsk.createdAtBlockNumber = createdAtBlockNumber
    inactiveAsk.inactivatedAtTimestamp = inactivatedAtTimestamp
    inactiveAsk.inactivatedAtBlockNumber = inactivatedAtBlockNumber
    inactiveAsk.transactionHash = transactionHash

    inactiveAsk.save()
    return inactiveAsk
}

/**
 * Create New InactiveBid Entity
 * @param id
 * @param type
 * @param space
 * @param amount
 * @param currency
 * @param sellOnShare
 * @param bidder
 * @param recipient
 * @param createdAtTimestamp
 * @param createdAtBlockNumber
 */
export function createInactiveBid(
    id: string,
    transactionHash: string,
    type: string,
    space: Space,
    amount: BigInt,
    currency: Currency,
    sellOnShare: BigInt,
    bidder: User,
    recipient: User,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt,
    inactivatedAtTimestamp: BigInt,
    inactivatedAtBlockNumber: BigInt
): InactiveBid {
    let inactiveBid = new InactiveBid(id)
    inactiveBid.type = type
    inactiveBid.transactionHash = transactionHash;
    (inactiveBid.space = space.id), (inactiveBid.amount = amount)
    inactiveBid.currency = currency.id
    inactiveBid.sellOnShare = sellOnShare
    inactiveBid.bidder = bidder.id
    inactiveBid.recipient = recipient.id
    inactiveBid.createdAtTimestamp = createdAtTimestamp
    inactiveBid.createdAtBlockNumber = createdAtBlockNumber
    inactiveBid.inactivatedAtTimestamp = inactivatedAtTimestamp
    inactiveBid.inactivatedAtBlockNumber = inactivatedAtBlockNumber

    inactiveBid.save()
    return inactiveBid
}

/**
 * Create New Bid Entity
 * @param id
 * @param amount
 * @param currency
 * @param sellOnShare
 * @param bidder
 * @param recipient
 * @param space
 * @param createdAtTimestamp
 * @param createdAtBlockNumber
 */
export function createBid(
    id: string,
    transactionHash: string,
    amount: BigInt,
    currency: Currency,
    sellOnShare: BigInt,
    bidder: User,
    recipient: User,
    space: Space,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt
): Bid {
    let bid = new Bid(id)
    bid.transactionHash = transactionHash
    bid.amount = amount
    bid.currency = currency.id
    bid.sellOnShare = sellOnShare
    bid.bidder = bidder.id
    bid.recipient = recipient.id
    bid.space = space.id
    bid.createdAtTimestamp = createdAtTimestamp
    bid.createdAtBlockNumber = createdAtBlockNumber

    bid.save()
    return bid
}

/**
 * Create New Transfer Entity
 * @param id
 * @param space
 * @param from
 * @param to
 * @param createdAtTimestamp
 * @param createdAtBlockNumber
 */
export function createTransfer(
    id: string,
    transactionHash: string,
    space: Space,
    from: User,
    to: User,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt
): Transfer {
    let transfer = new Transfer(id)
    transfer.space = space.id
    transfer.transactionHash = transactionHash
    transfer.from = from.id
    transfer.to = to.id
    transfer.createdAtTimestamp = createdAtTimestamp
    transfer.createdAtBlockNumber = createdAtBlockNumber

    transfer.save()
    return transfer
}

/**
 * Create New URIUpdate Entity
 * @param id
 * @param space
 * @param type
 * @param from
 * @param to
 * @param updater
 * @param owner
 * @param createdAtTimestamp
 * @param createdAtBlockNumber
 */
export function createURIUpdate(
    id: string,
    transactionHash: string,
    space: Space,
    type: string,
    from: string,
    to: string,
    updater: string,
    owner: string,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt
): URIUpdate {
    let uriUpdate = new URIUpdate(id)
    uriUpdate.transactionHash = transactionHash
    uriUpdate.space = space.id
    uriUpdate.type = type
    uriUpdate.from = from
    uriUpdate.to = to
    uriUpdate.updater = updater
    uriUpdate.owner = owner
    uriUpdate.createdAtTimestamp = createdAtTimestamp
    uriUpdate.createdAtBlockNumber = createdAtBlockNumber

    uriUpdate.save()
    return uriUpdate
}

export function createReserveListing(
    id: string,
    transactionHash: string,
    tokenId: BigInt,
    tokenContract: string, 
    space: Space | null,
    startsAt: BigInt,
    duration: BigInt,
    listPrice: BigInt,
    listType: i32,
    intermediaryFeePercentage: i32,
    listCurrency: Currency,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt,
    tokenOwner: User,
    intermediary: User
): ReserveListing {
    let reserveListing = new ReserveListing(id)

    reserveListing.tokenId = tokenId
    reserveListing.transactionHash = transactionHash
    reserveListing.tokenContract = tokenContract 
    reserveListing.token = tokenContract.concat('-').concat(tokenId.toString())
    reserveListing.space = space ? space.id : null
    reserveListing.approved = true//false
    reserveListing.startsAt = startsAt
    reserveListing.duration = duration
    reserveListing.firstBidTime = BigInt.fromI32(0)
    reserveListing.approvedTimestamp = createdAtTimestamp//null
    reserveListing.listPrice = listPrice
    reserveListing.listType = listType 
    reserveListing.intermediaryFeePercentage = intermediaryFeePercentage
    reserveListing.tokenOwner = tokenOwner.id
    reserveListing.intermediary = intermediary.id
    reserveListing.listCurrency = listCurrency.id
    reserveListing.status = 'Pending'
    reserveListing.createdAtTimestamp = createdAtTimestamp
    reserveListing.createdAtBlockNumber = createdAtBlockNumber

    reserveListing.save()

    return reserveListing
}

export function setReserveListingFirstBidTime(listing: ReserveListing, time: BigInt): void {
    listing.firstBidTime = time
    listing.expectedEndTimestamp = listing.duration.plus(time)
    listing.save()
}

export function handleReserveListingExtended(listing: ReserveListing, duration: BigInt): void {
    listing.duration = duration
    listing.expectedEndTimestamp = listing.firstBidTime.plus(duration)
    listing.save()
}

export function createReserveListingBid(
    id: string,
    transactionHash: string,
    listing: ReserveListing,
    amount: BigInt,
    createdAtTimestamp: BigInt,
    createdAtBlockNumber: BigInt,
    bidder: User
): ReserveListingBid {
    let bid = new ReserveListingBid(id)

    log.warning('Creating active bid with id {}', [id])

    bid.reserveListing = listing.id
    bid.transactionHash = transactionHash
    bid.amount = amount
    bid.bidder = bidder.id
    bid.bidType = 'Active'
    bid.createdAtTimestamp = createdAtTimestamp
    bid.createdAtBlockNumber = createdAtBlockNumber

    bid.save()

    listing.currentBid = bid.id
    listing.save()

    return bid
}

// Create an inactive bid based off of the current highest bid, and delete the active bid
export function handleBidReplaced(listing: ReserveListing, timestamp: BigInt, blockNumber: BigInt, winningBid: boolean = false): void {
    let activeBid = ReserveListingBid.load(listing.currentBid) as ReserveListingBid
    let inactiveBid = new InactiveReserveListingBid(activeBid.id)

    log.info('setting reserve listing', [])
    inactiveBid.reserveListing = activeBid.reserveListing
    inactiveBid.transactionHash = activeBid.transactionHash
    log.info('setting amount: {}', [activeBid.amount.toString()])
    inactiveBid.amount = activeBid.amount
    log.info('setting bidder', [])
    inactiveBid.bidder = activeBid.bidder
    log.info('setting bid type', [])
    inactiveBid.bidType = winningBid ? 'Final' : 'Refunded'
    log.info('setting bid IAT', [])
    inactiveBid.bidInactivatedAtTimestamp = timestamp
    log.info('setting bid IABN', [])
    inactiveBid.bidInactivatedAtBlockNumber = blockNumber
    log.info('setting bid CAT', [])
    inactiveBid.createdAtTimestamp = activeBid.createdAtTimestamp
    log.info('setting bid CABN', [])
    inactiveBid.createdAtBlockNumber = activeBid.createdAtBlockNumber

    inactiveBid.save()

    store.remove('ReserveListingBid', activeBid.id)
}

export function handleFinishedListing(listing: ReserveListing, timestamp: BigInt, blockNumber: BigInt, canceledListing: boolean = false): void {
    listing.finalizedAtTimestamp = timestamp
    listing.finalizedAtBlockNumber = blockNumber
    listing.status = canceledListing ? 'Canceled' : 'Finished'
    listing.save()
}

function isNullEthValue(value: string): boolean {
    return value == '0x0000000000000000000000000000000000000000000000000000000000000001'
}