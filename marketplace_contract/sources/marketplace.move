module marketplace_addr::marketplace {
    use std::string::{String};
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::event;

    /// Errors
    const E_NOT_AUTHORIZED: u64 = 1;

    struct Dataset has store, copy, drop {
        blob_name: String,
        owner_address: address,
        price: u64,
        category: String,
        description: String
    }

    struct Registry has key {
        datasets: vector<Dataset>
    }

    #[event]
    struct DatasetRegistered has drop, store {
        blob_name: String,
        owner: address,
        price: u64
    }

    /// Initialize the registry under the deployer's account
    fun init_module(sender: &signer) {
        move_to(sender, Registry {
            datasets: vector::empty<Dataset>()
        });
    }

    /// Register a new dataset to the global marketplace
    public entry fun register_dataset(
        _sender: &signer,
        blob_name: String,
        owner_address: address,
        price: u64,
        category: String,
        description: String
    ) acquires Registry {
        let registry = borrow_global_mut<Registry>(@marketplace_addr);
        let new_dataset = Dataset {
            blob_name,
            owner_address,
            price,
            category,
            description
        };
        vector::push_back(&mut registry.datasets, new_dataset);

        event::emit(DatasetRegistered {
            blob_name,
            owner: owner_address,
            price
        });
    }

    /// View all registered datasets
    #[view]
    public fun get_all_registered_datasets(): vector<Dataset> acquires Registry {
        let registry = borrow_global<Registry>(@marketplace_addr);
        registry.datasets
    }
}
