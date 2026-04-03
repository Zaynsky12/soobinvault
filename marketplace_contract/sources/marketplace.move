module marketplace_addr::marketplace {
    use std::string::{String};
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::event;
    use aptos_framework::signer;
    use aptos_framework::fungible_asset::{Metadata};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::object::{Object};

    /// Errors
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_DATASET_NOT_FOUND: u64 = 2;
    const E_STOREFRONT_NOT_FOUND: u64 = 3;
    const E_INVALID_METADATA: u64 = 4;

    struct Dataset has store, copy, drop {
        blob_name: String,
        owner_address: address,
        price: u64,
        category: String,
        description: String,
        payment_metadata: address
    }

    struct UserStorefront has key {
        datasets: vector<Dataset>
    }

    #[event]
    struct DatasetListed has drop, store {
        blob_name: String,
        owner: address,
        price: u64
    }

    #[event]
    struct DatasetPurchased has drop, store {
        blob_name: String,
        buyer: address,
        seller: address,
        price: u64
    }

    #[event]
    struct DatasetDelisted has drop, store {
        blob_name: String,
        owner: address
    }

    /// List a new dataset in your own storefront (Account-Centric P2P)
    public entry fun list_dataset(
        sender: &signer,
        blob_name: String,
        price: u64,
        category: String,
        description: String,
        payment_metadata: address
    ) acquires UserStorefront {
        let sender_addr = signer::address_of(sender);
        
        if (!exists<UserStorefront>(sender_addr)) {
            move_to(sender, UserStorefront {
                datasets: vector::empty<Dataset>()
            });
        };

        let storefront = borrow_global_mut<UserStorefront>(sender_addr);
        let new_dataset = Dataset {
            blob_name,
            owner_address: sender_addr,
            price,
            category,
            description,
            payment_metadata
        };
        vector::push_back(&mut storefront.datasets, new_dataset);

        event::emit(DatasetListed {
            blob_name,
            owner: sender_addr,
            price
        });
    }

    /// Purchase a dataset directly from a seller's storefront (P2P SUSD Transfer)
    public entry fun purchase_dataset(
        buyer: &signer,
        seller: address,
        blob_name: String
    ) acquires UserStorefront {
        assert!(exists<UserStorefront>(seller), E_STOREFRONT_NOT_FOUND);
        
        let storefront = borrow_global<UserStorefront>(seller);
        let datasets = &storefront.datasets;
        let len = vector::length(datasets);
        let i = 0;
        let found = false;
        let price = 0;
        let payment_metadata = @0x0;

        while (i < len) {
            let dataset = vector::borrow(datasets, i);
            if (dataset.blob_name == blob_name) {
                price = dataset.price;
                payment_metadata = dataset.payment_metadata;
                found = true;
                break
            };
            i = i + 1;
        };

        assert!(found, E_DATASET_NOT_FOUND);

        // Execute P2P Fungible Asset Transfer
        if (price > 0) {
            let metadata = aptos_framework::object::address_to_object<Metadata>(payment_metadata);
            primary_fungible_store::transfer(buyer, metadata, seller, price);
        };

        event::emit(DatasetPurchased {
            blob_name,
            buyer: signer::address_of(buyer),
            seller,
            price
        });
    }

    /// Remove a dataset from your storefront.
    /// If it was the last dataset, the entire UserStorefront resource is removed to save storage.
    public entry fun delist_dataset(
        sender: &signer,
        blob_name: String
    ) acquires UserStorefront {
        let sender_addr = signer::address_of(sender);
        assert!(exists<UserStorefront>(sender_addr), E_STOREFRONT_NOT_FOUND);

        let storefront = borrow_global_mut<UserStorefront>(sender_addr);
        let datasets = &mut storefront.datasets;
        let len = vector::length(datasets);
        let i = 0;
        let found = false;

        while (i < len) {
            if (vector::borrow(datasets, i).blob_name == blob_name) {
                vector::remove(datasets, i);
                found = true;
                break
            };
            i = i + 1;
        };

        assert!(found, E_DATASET_NOT_FOUND);

        event::emit(DatasetDelisted {
            blob_name,
            owner: sender_addr
        });

        // Clean up resource if storefront is now empty
        if (vector::is_empty(datasets)) {
            let UserStorefront { datasets: datasets_to_destroy } = move_from<UserStorefront>(sender_addr);
            vector::destroy_empty(datasets_to_destroy);
        }
    }

    /// View all datasets in a user's storefront
    #[view]
    public fun get_user_storefront(user: address): vector<Dataset> acquires UserStorefront {
        if (exists<UserStorefront>(user)) {
            let storefront = borrow_global<UserStorefront>(user);
            storefront.datasets
        } else {
            vector::empty<Dataset>()
        }
    }
}
