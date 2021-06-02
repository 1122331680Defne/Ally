import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Dropdown, Modal, message } from 'antd';
import { KEYRING_TYPE, HARDWARE_KEYRING_TYPES } from 'consts';
import { useWallet } from 'ui/utils';
import { AddressList, PageHeader, AuthenticationModal } from 'ui/component';
import { DisplayedKeryring } from 'background/service/keyring';
import { IconArrowDown } from 'ui/assets';
import IconAdd from 'ui/assets/add.svg';
import './style.less';

const AddressManagement = () => {
  const wallet = useWallet();
  const [accounts, setAccounts] = useState<Record<string, DisplayedKeryring[]>>(
    {}
  );
  const [hiddenAddresses, setHiddenAddresses] = useState<
    { type: string; address: string }[]
  >([]);

  useEffect(() => {
    setHiddenAddresses(wallet.getHiddenAddresses());
  }, []);

  const getAllKeyrings = async () => {
    const _accounts = await wallet.getAllClassAccounts();

    setAccounts(_accounts);
  };

  const handleViewMnemonics = async () => {
    try {
      await AuthenticationModal(wallet);
      const mnemonic = await wallet.getCurrentMnemonics();
      Modal.info({
        title: 'Mnemonics',
        content: mnemonic,
        cancelText: null,
        okText: null,
        className: 'single-btn',
      });
    } catch (e) {
      // NOTHING
    }
  };

  const AddressActionButton = ({
    data,
    keyring,
  }: {
    data: string;
    keyring: any;
  }) => {
    const handlleViewPrivateKey = async () => {
      try {
        await AuthenticationModal(wallet);
        const privateKey = await keyring.exportAccount(data);
        Modal.info({
          title: 'Private Key',
          content: privateKey,
          cancelText: null,
          okText: null,
          className: 'single-btn',
        });
      } catch (e) {
        // NOTHING
      }
    };

    const handleDeleteAddress = async () => {
      await wallet.removeAddress(data, keyring.type);
      message.success('removed');
      getAllKeyrings();
    };

    const handleToggleAddressVisible = async () => {
      const isHidden = hiddenAddresses.find(
        (item) => item.type === keyring.type && item.address === data
      );
      if (isHidden) {
        setHiddenAddresses(
          hiddenAddresses.filter(
            (item) => item.type !== keyring.type || item.address !== data
          )
        );
        wallet.showAddress(keyring.type, data);
      } else {
        const totalCount = await wallet.getAccountsCount();
        if (hiddenAddresses.length >= totalCount - 1) {
          message.error('Keep at least one address visible.');
          return;
        }
        setHiddenAddresses([
          ...hiddenAddresses,
          { type: keyring.type, address: data },
        ]);
        wallet.hideAddress(keyring.type, data);
      }
    };

    const DropdownOptions = () => {
      switch (keyring.type) {
        case KEYRING_TYPE.HdKeyring:
          return (
            <Menu>
              <Menu.Item onClick={handleToggleAddressVisible}>
                {hiddenAddresses.find(
                  (item) => item.address === data && item.type === keyring.type
                )
                  ? 'Show'
                  : 'Hide'}{' '}
                address
              </Menu.Item>
              <Menu.Item onClick={handlleViewPrivateKey}>
                View private key
              </Menu.Item>
            </Menu>
          );
        case KEYRING_TYPE.SimpleKeyring:
          return (
            <Menu>
              <Menu.Item onClick={handleToggleAddressVisible}>
                {hiddenAddresses.find(
                  (item) => item.address === data && item.type === keyring.type
                )
                  ? 'Show'
                  : 'Hide'}{' '}
                address
              </Menu.Item>
              <Menu.Item onClick={handlleViewPrivateKey}>
                View private key
              </Menu.Item>
            </Menu>
          );
        case HARDWARE_KEYRING_TYPES.Ledger.type:
        case HARDWARE_KEYRING_TYPES.Trezor.type:
        case HARDWARE_KEYRING_TYPES.Onekey.type:
        case KEYRING_TYPE.WatchAddressKeyring:
          return (
            <Menu>
              <Menu.Item onClick={handleDeleteAddress}>
                Delete address
              </Menu.Item>
            </Menu>
          );
        default:
          return <></>;
      }
    };
    return (
      <Dropdown overlay={DropdownOptions} trigger={['click']}>
        <div className="flex">
          {hiddenAddresses.find(
            (item) => item.address === data && item.type === keyring.type
          ) && <div className="address-item-hidden">Hidden</div>}
          <IconArrowDown className="icon icon-arrow-down cursor-pointer text-gray-content fill-current" />
        </div>
      </Dropdown>
    );
  };

  useEffect(() => {
    getAllKeyrings();
  }, []);

  return (
    <div className="address-management">
      <PageHeader>Address Management</PageHeader>
      <AddressList
        list={accounts}
        action="management"
        ActionButton={AddressActionButton}
        hiddenAddresses={hiddenAddresses}
        onShowMnemonics={handleViewMnemonics}
      />
      <Link className="create-address" to="/add-address">
        <img src={IconAdd} className="icon icon-add" />
        Add Address
      </Link>
    </div>
  );
};

export default AddressManagement;